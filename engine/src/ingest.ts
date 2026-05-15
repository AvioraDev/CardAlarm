import crypto from 'crypto';
import type { DbClient } from './db';
import type {
  SourceConfig,
  ShopifyProduct,
  ShopifyProductsResponse,
  ScanMode,
  SourceProductCacheInput,
  SourceProductCacheStatus,
} from './types';
import { enqueueAlertCandidates, processPendingAlerts } from './alerts';
import {
  createStoreScanRun,
  markStoreScanFailed,
  markStoreScanSucceeded,
  markMissingSourceProductsOOS,
  markSourceProductsMatched,
  updateStoreScanRun,
  upsertSourceProducts,
} from './db';
import { reconcileActiveWatchlistMatches } from './watchlist-reconciliation';

const PAGE_SIZE = Number(process.env.CARDALARM_PAGE_SIZE ?? 100);
const EARLY_STOP_UNCHANGED_PAGES = Number(process.env.CARDALARM_EARLY_STOP_UNCHANGED_PAGES ?? 2);
const FETCH_TIMEOUT_MS = Number(process.env.CARDALARM_FETCH_TIMEOUT_MS ?? 15000);
const IDENTITY_EVALUATION_VERSION = 'deterministic-title-v1';
const PAGE_CONCURRENCY = scanPageConcurrency();

export type StopReason = 'empty_page' | 'partial_page' | 'early_stop' | 'fetch_error';
export type SourceScanPhase =
  | 'fetching'
  | 'caching'
  | 'matching'
  | 'post_scan_mark_matched'
  | 'post_scan_mark_oos'
  | 'completed'
  | 'failed';

export type SourceScanProgress = {
  skipped: number;
  scanStrategy: SourceConfig['scanStrategy'];
  earlyStopEnabled: boolean;
  earlyStopUnchangedPages: number;
  stoppedEarly: boolean;
  pagesFetched: number;
  lastPageFetched: number | null;
  stopReason: StopReason | null;
  fetchDurationMs: number;
  cacheDurationMs: number;
  matchDurationMs: number;
  postScanDurationMs: number;
  totalDurationMs: number;
};

export type SourceScanMetadata = SourceScanProgress & {
  phase: SourceScanPhase;
};

class SourceScanError extends Error {
  constructor(message: string, readonly metadata: SourceScanMetadata) {
    super(message);
  }
}

type EarlyStopConfig = {
  enabled: boolean;
  unchangedPageThreshold: number;
};

type ScanDelayConfig = {
  minMs: number;
  maxMs: number;
};

function parseNonNegativeInteger(value: string | number | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

export function scanPageConcurrency(value: string | number | undefined = process.env.CARDALARM_PAGE_CONCURRENCY): number {
  const parsed = parseNonNegativeInteger(value, 1);
  return Math.min(5, Math.max(1, parsed));
}

export function scanStoreConcurrency(value: string | number | undefined = process.env.CARDALARM_STORE_SCAN_CONCURRENCY): number {
  const parsed = parseNonNegativeInteger(value, 2);
  return Math.min(4, Math.max(1, parsed));
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex++;

      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runNext()));
  return results;
}

export function scanDelayConfig(
  minValue: string | number | undefined = process.env.CARDALARM_SCAN_DELAY_MIN_MS,
  maxValue: string | number | undefined = process.env.CARDALARM_SCAN_DELAY_MAX_MS
): ScanDelayConfig {
  const minMs = parseNonNegativeInteger(minValue, 2000);
  const rawMaxMs = parseNonNegativeInteger(maxValue, 5000);
  return {
    minMs,
    maxMs: Math.max(minMs, rawMaxMs),
  };
}

type SourceScanResult = {
  fetched: number;
  processed: number;
  skipped: number;
  matched: number;
  markedOOS: number;
  pagesFetched: number;
  lastPageFetched: number | null;
  stoppedEarly: boolean;
  stopReason: StopReason;
  fetchDurationMs: number;
  cacheDurationMs: number;
  matchDurationMs: number;
  postScanDurationMs: number;
  totalDurationMs: number;
};

export function stopReasonForPageResult(products: ShopifyProduct[] | null, pageSize = PAGE_SIZE): StopReason | null {
  if (products === null) return 'fetch_error';
  if (products.length === 0) return 'empty_page';
  if (products.length < pageSize) return 'partial_page';
  return null;
}

export function buildSourceScanMetadata(
  phase: SourceScanPhase,
  progress: SourceScanProgress
): SourceScanMetadata {
  return {
    phase,
    ...progress,
  };
}

export function earlyStopConfigForSource(source: SourceConfig): EarlyStopConfig {
  return {
    enabled: source.scanStrategy === 'incremental' && source.earlyStopEnabled,
    unchangedPageThreshold: Math.max(1, source.earlyStopUnchangedPages || EARLY_STOP_UNCHANGED_PAGES),
  };
}

export function shouldStopForUnchangedPages(
  config: EarlyStopConfig,
  consecutiveUnchangedPages: number
): boolean {
  return config.enabled && consecutiveUnchangedPages >= config.unchangedPageThreshold;
}

function randomDelay(): Promise<void> {
  const { minMs, maxMs } = scanDelayConfig();
  const ms = minMs === maxMs ? minMs : minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function hashJson(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildIdentityContextHash(): string {
  return hashJson({ classifierVersion: IDENTITY_EVALUATION_VERSION });
}

async function fetchProductPage(
  baseUrl: string,
  page: number
): Promise<ShopifyProduct[] | null> {
  const url = `${normalizeBaseUrl(baseUrl)}/products.json?limit=${PAGE_SIZE}&page=${page}`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  console.log(`  ↳ Fetching page ${page}: ${url}`);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'CardAlarmBot/0.1 (+https://cardalarm.local)',
      },
    });
    if (!response.ok) {
      console.error(`  ✗ HTTP ${response.status} from ${url}`);
      return null;
    }

    const data = (await response.json()) as ShopifyProductsResponse;
    const products = data.products ?? [];
    console.log(`  ↳ Page ${page} fetched ${products.length} products in ${Date.now() - startedAt}ms`);
    return products;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const isTimeout = error.name === 'AbortError';
    console.error(`  ✗ ${isTimeout ? 'Timeout' : 'Network error'} fetching ${url} after ${Date.now() - startedAt}ms:`, error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function productContentHash(product: ShopifyProduct): string {
  const firstVariant = product.variants[0];
  return hashJson({
    id: product.id,
    title: product.title,
    handle: product.handle,
    price: firstVariant?.price ?? null,
    available: firstVariant?.available ?? false,
    imageUrl: product.images[0]?.src ?? '',
    description: product.body_html ?? '',
  });
}

function toCacheInput(
  product: ShopifyProduct,
  source: SourceConfig,
  scanToken: string
): SourceProductCacheInput {
  const firstVariant = product.variants[0];
  const baseUrl = normalizeBaseUrl(source.baseUrl);

  return {
    storeId: source.storeId ?? null,
    source: source.slug,
    externalId: String(product.id),
    handle: product.handle,
    title: product.title,
    price: parseFloat(firstVariant?.price ?? '0'),
    available: firstVariant?.available ?? false,
    url: `${baseUrl}/products/${product.handle}`,
    imageUrl: product.images[0]?.src ?? '',
    description: product.body_html ?? '',
    rawPayload: JSON.stringify(product),
    contentHash: productContentHash(product),
    scanToken,
  };
}

async function processSource(
  db: DbClient,
  storeScanRunId: number,
  source: SourceConfig,
  scanToken: string,
  identityContextHash: string
): Promise<SourceScanResult> {
  console.log(`\n▶ Ingesting: ${source.name} (${source.baseUrl})`);

  const totalStartedAt = Date.now();
  const earlyStopConfig = earlyStopConfigForSource(source);
  let page = 1;
  let consecutiveUnchangedPages = 0;
  let fetched = 0;
  let pagesFetched = 0;
  let lastPageFetched: number | null = null;
  let processed = 0;
  let skipped = 0;
  let matched = 0;
  let hadFetchError = false;
  let stoppedEarlyFromCache = false;
  let stopReason: StopReason | null = null;
  let fetchDurationMs = 0;
  let cacheDurationMs = 0;
  let matchDurationMs = 0;
  let postScanDurationMs = 0;
  const evaluatedCacheRows: { externalId: string; contentHash: string }[] = [];
  const currentProgress = (): SourceScanProgress => ({
    skipped,
    scanStrategy: source.scanStrategy,
    earlyStopEnabled: earlyStopConfig.enabled,
    earlyStopUnchangedPages: earlyStopConfig.unchangedPageThreshold,
    stoppedEarly: stoppedEarlyFromCache,
    pagesFetched,
    lastPageFetched,
    stopReason,
    fetchDurationMs,
    cacheDurationMs,
    matchDurationMs,
    postScanDurationMs,
    totalDurationMs: Date.now() - totalStartedAt,
  });
  const publishProgress = async (phase: SourceScanPhase): Promise<void> => {
    await updateStoreScanRun(db, storeScanRunId, {
      status: phase === 'failed' ? 'failed' : 'running',
      productsSeen: fetched,
      productsProcessed: processed,
      productsMatched: matched,
      metadata: buildSourceScanMetadata(phase, currentProgress()),
    });
  };

  while (true) {
    const pageNumbers = Array.from({ length: PAGE_CONCURRENCY }, (_, index) => page + index);
    const fetchStartedAt = Date.now();
    const pages = await Promise.all(pageNumbers.map(pageNumber => fetchProductPage(source.baseUrl, pageNumber)));
    fetchDurationMs += Date.now() - fetchStartedAt;

    let reachedEnd = false;

    for (const [index, products] of pages.entries()) {
      const pageNumber = pageNumbers[index]!;
      const pageStopReason = stopReasonForPageResult(products);

      if (!products) {
        hadFetchError = true;
        reachedEnd = true;
        stopReason = 'fetch_error';
        await publishProgress('fetching');
        continue;
      }

      pagesFetched++;
      lastPageFetched = pageNumber;

      if (products.length === 0) {
        reachedEnd = true;
        stopReason = stopReason ?? pageStopReason;
        consecutiveUnchangedPages++;
        await publishProgress('fetching');
        continue;
      }

      fetched += products.length;
      await publishProgress('fetching');

      const cacheInputs = products.map(product => toCacheInput(product, source, scanToken));
      const upsertStartedAt = Date.now();
      console.log(`  ↳ Caching page ${page}: ${cacheInputs.length} products`);
      const statuses = await upsertSourceProducts(db, cacheInputs, identityContextHash);
      const pageCacheDurationMs = Date.now() - upsertStartedAt;
      cacheDurationMs += pageCacheDurationMs;
      await publishProgress('caching');
      console.log(`  ↳ Cached page ${page} in ${Date.now() - upsertStartedAt}ms`);
      const statusById = new Map(statuses.map(status => [status.externalId, status]));
      const isUnchangedFullPage =
        products.length === PAGE_SIZE &&
        statuses.every(status => !status.isNew && !status.changed && !status.shouldMatch);

      consecutiveUnchangedPages = isUnchangedFullPage ? consecutiveUnchangedPages + 1 : 0;

      const matchStartedAt = Date.now();
      let pageProcessed = 0;
      for (const cacheInput of cacheInputs) {
        const status = statusById.get(cacheInput.externalId) as SourceProductCacheStatus | undefined;
        if (!status?.shouldMatch) {
          skipped++;
          continue;
        }

        processed++;
        pageProcessed++;

        evaluatedCacheRows.push({
          externalId: cacheInput.externalId,
          contentHash: cacheInput.contentHash,
        });
      }
      console.log(`  ↳ Evaluated identity for page ${page} in ${Date.now() - matchStartedAt}ms. Processed: ${pageProcessed}`);

      const pageMatchDurationMs = Date.now() - matchStartedAt;
      matchDurationMs += pageMatchDurationMs;
      await publishProgress('matching');

      if (products.length < PAGE_SIZE) {
        reachedEnd = true;
        stopReason = stopReason ?? pageStopReason;
      }
    }

    const shouldStopEarly = !reachedEnd && shouldStopForUnchangedPages(earlyStopConfig, consecutiveUnchangedPages);
    if (reachedEnd || shouldStopEarly) {
      if (shouldStopEarly) {
        stoppedEarlyFromCache = true;
        stopReason = 'early_stop';
        console.log(`  ↳ Early stop: ${consecutiveUnchangedPages} unchanged pages in a row`);
      }
      break;
    }

    page += PAGE_CONCURRENCY;
    await randomDelay();
  }

  const postScanStartedAt = Date.now();
  await publishProgress('post_scan_mark_matched');
  await markSourceProductsMatched(db, source.slug, evaluatedCacheRows, identityContextHash);
  let markedOOS = 0;
  if (!hadFetchError && !stoppedEarlyFromCache) {
    await publishProgress('post_scan_mark_oos');
    markedOOS = await markMissingSourceProductsOOS(db, source.slug, scanToken);
  }
  postScanDurationMs = Date.now() - postScanStartedAt;
  const metadata = buildSourceScanMetadata('completed', {
    ...currentProgress(),
    stopReason: stopReason ?? 'empty_page',
  });

  if (hadFetchError && fetched === 0) {
    throw new SourceScanError('Failed to fetch products from the store.', metadata);
  }

  console.log(
    `  ↳ Source done. Fetched: ${fetched}, Identity processed: ${processed}, Skipped cache: ${skipped}, Matched: ${matched}, Marked OOS: ${markedOOS}`
  );

  return {
    fetched,
    processed,
    skipped,
    matched,
    markedOOS,
    pagesFetched,
    lastPageFetched,
    stoppedEarly: stoppedEarlyFromCache,
    stopReason: metadata.stopReason ?? 'empty_page',
    fetchDurationMs: metadata.fetchDurationMs,
    cacheDurationMs: metadata.cacheDurationMs,
    matchDurationMs: metadata.matchDurationMs,
    postScanDurationMs: metadata.postScanDurationMs,
    totalDurationMs: metadata.totalDurationMs,
  };
}

interface ScanOptions {
  mode: ScanMode;
  onProgress?: (progress: { processed: number; matched: number }) => Promise<void>;
}

export async function runIngestionCycle(
  db: DbClient,
  sources: SourceConfig[],
  options: ScanOptions = { mode: 'full' }
): Promise<{ processed: number; matched: number }> {
  const identityContextHash = buildIdentityContextHash();
  const runToken = `${Date.now()}-${crypto.randomUUID()}`;
  const storeConcurrency = scanStoreConcurrency();

  console.log(
    `  Mode: ${options.mode} | Store concurrency: ${storeConcurrency} | Page concurrency per store: ${PAGE_CONCURRENCY}`
  );
  console.log(`  Scan updates cached inventory and deterministic card identity`);

  const results: SourceScanResult[] = [];
  const sourceErrors: string[] = [];
  let completedStoreCount = 0;
  let failedStoreCount = 0;

  async function publishAggregateProgress(): Promise<void> {
    if (!options.onProgress) return;
    await options.onProgress({
      processed: results.reduce((sum, result) => sum + result.processed, 0),
      matched: results.reduce((sum, result) => sum + result.matched, 0),
    });
  }

  async function processStore(source: SourceConfig): Promise<SourceScanResult> {
    const storeScanRunId = await createStoreScanRun(db, source);

    try {
      const sourceResult = await processSource(
        db,
        storeScanRunId,
        source,
        `${runToken}-${source.slug}`,
        identityContextHash
      );
      results.push(sourceResult);
      completedStoreCount++;
      await updateStoreScanRun(db, storeScanRunId, {
        status: 'completed',
        productsSeen: sourceResult.fetched,
        productsProcessed: sourceResult.processed,
        productsMatched: sourceResult.matched,
        productsMarkedUnavailable: sourceResult.markedOOS,
        metadata: {
          phase: 'completed',
          skipped: sourceResult.skipped,
          scanStrategy: source.scanStrategy,
          earlyStopEnabled: earlyStopConfigForSource(source).enabled,
          earlyStopUnchangedPages: earlyStopConfigForSource(source).unchangedPageThreshold,
          stoppedEarly: sourceResult.stoppedEarly,
          pagesFetched: sourceResult.pagesFetched,
          lastPageFetched: sourceResult.lastPageFetched,
          stopReason: sourceResult.stopReason,
          fetchDurationMs: sourceResult.fetchDurationMs,
          cacheDurationMs: sourceResult.cacheDurationMs,
          matchDurationMs: sourceResult.matchDurationMs,
          postScanDurationMs: sourceResult.postScanDurationMs,
          totalDurationMs: sourceResult.totalDurationMs,
        },
      });
      await markStoreScanSucceeded(db, source.storeId);
      await publishAggregateProgress();
      return sourceResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      sourceErrors.push(`${source.slug}: ${errorMessage}`);
      failedStoreCount++;
      await updateStoreScanRun(db, storeScanRunId, {
        status: 'failed',
        errorMessage,
        metadata:
          err instanceof SourceScanError
            ? { ...err.metadata, phase: 'failed' }
            : { phase: 'failed', stopReason: 'fetch_error' },
      });
      await markStoreScanFailed(db, source.storeId);
      console.error(`  Source failed: ${source.name} (${source.slug})`, errorMessage);
      throw err;
    } finally {
      await randomDelay();
    }
  }

  await runWithConcurrency(sources, storeConcurrency, processStore);

  const totalFetched = results.reduce((sum, result) => sum + result.fetched, 0);
  const totalProcessed = results.reduce((sum, result) => sum + result.processed, 0);
  const totalSkipped = results.reduce((sum, result) => sum + result.skipped, 0);
  const totalMatched = results.reduce((sum, result) => sum + result.matched, 0);
  const totalMarkedOOS = results.reduce((sum, result) => sum + result.markedOOS, 0);
  let reconciledMatches = 0;

  try {
    reconciledMatches = await reconcileActiveWatchlistMatches(db);
    const alertsQueued = await enqueueAlertCandidates(db);
    const alertsProcessed = await processPendingAlerts(db);
    console.log(
      `  Watchlist reconciliation: ${reconciledMatches} matches, ${alertsQueued} alerts queued/promoted, ${alertsProcessed} alerts processed.`
    );
    if (options.onProgress) {
      await options.onProgress({
        processed: totalProcessed,
        matched: reconciledMatches,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('  Alert reconciliation failed:', message);
  }

  console.log(
    `\n✅ Ingestion complete. Fetched: ${totalFetched}, Processed: ${totalProcessed}, Skipped cache: ${totalSkipped}, Matched: ${totalMatched}, Marked OOS: ${totalMarkedOOS}, Completed stores: ${completedStoreCount}, Failed stores: ${failedStoreCount}`
  );

  if (sourceErrors.length > 0) {
    throw new Error(`One or more store scans failed after all stores settled: ${sourceErrors.join('; ')}`);
  }

  return { processed: totalProcessed, matched: reconciledMatches || totalMatched };
}
