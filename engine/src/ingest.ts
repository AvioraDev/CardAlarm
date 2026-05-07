import crypto from 'crypto';
import type { DbClient } from './db';
import type {
  SourceConfig,
  ShopifyProduct,
  ShopifyProductsResponse,
  RawListing,
  ScanMode,
  SourceProductCacheInput,
  SourceProductCacheStatus,
  WatchlistRow,
} from './types';
import { processListingWithCache } from './match';
import {
  getActiveWatchlistPlayers,
  getAllChecklistPlayerNames,
  markMissingSourceProductsOOS,
  markSourceProductsMatched,
  upsertSourceProducts,
} from './db';

const PAGE_SIZE = Number(process.env.CARDALARM_PAGE_SIZE ?? 100);
const PAGE_CONCURRENCY = Number(process.env.CARDALARM_PAGE_CONCURRENCY ?? 1);
const EARLY_STOP_UNCHANGED_PAGES = Number(process.env.CARDALARM_EARLY_STOP_UNCHANGED_PAGES ?? 2);
const FETCH_TIMEOUT_MS = Number(process.env.CARDALARM_FETCH_TIMEOUT_MS ?? 15000);
const MATCHER_VERSION = 'matcher-v2-cache-v1';

function randomDelay(): Promise<void> {
  const minMs = Number(process.env.CARDALARM_SCAN_DELAY_MIN_MS ?? 2000);
  const maxMs = Number(process.env.CARDALARM_SCAN_DELAY_MAX_MS ?? 5000);
  const ms = minMs + Math.floor(Math.random() * Math.max(0, maxMs - minMs));
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function hashJson(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildMatchContextHash(watchlistEntries: WatchlistRow[]): string {
  const watchlistContext = watchlistEntries
    .map(entry => ({
      playerName: entry.player_name,
      variants: entry.variants,
      targetNumbers: entry.target_numbers,
      isActive: entry.is_active,
    }))
    .sort((a, b) => a.playerName.localeCompare(b.playerName));

  return hashJson({ matcherVersion: MATCHER_VERSION, watchlistContext });
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

function toRawListing(product: SourceProductCacheInput): RawListing | null {
  if (!product.available) return null;

  return {
    externalId: product.externalId,
    source: product.source,
    title: product.title,
    price: product.price,
    url: product.url,
    imageUrl: product.imageUrl,
  };
}

async function processSource(
  db: DbClient,
  source: SourceConfig,
  scanToken: string,
  matchContextHash: string,
  watchlistEntries: WatchlistRow[],
  watchlistNameSet: Set<string>,
  allPlayerNames: string[]
): Promise<{
  fetched: number;
  processed: number;
  skipped: number;
  matched: number;
  markedOOS: number;
}> {
  console.log(`\n▶ Ingesting: ${source.name} (${source.baseUrl})`);

  let page = 1;
  let consecutiveUnchangedPages = 0;
  let fetched = 0;
  let processed = 0;
  let skipped = 0;
  let matched = 0;
  let hadFetchError = false;
  let stoppedEarlyFromCache = false;
  const matchedCacheRows: { externalId: string; contentHash: string }[] = [];

  while (true) {
    const pageNumbers = Array.from({ length: PAGE_CONCURRENCY }, (_, index) => page + index);
    const pages = await Promise.all(pageNumbers.map(pageNumber => fetchProductPage(source.baseUrl, pageNumber)));

    let reachedEnd = false;

    for (const products of pages) {
      if (!products) {
        hadFetchError = true;
        reachedEnd = true;
        continue;
      }

      if (products.length === 0) {
        reachedEnd = true;
        consecutiveUnchangedPages++;
        continue;
      }

      fetched += products.length;

      const cacheInputs = products.map(product => toCacheInput(product, source, scanToken));
      const upsertStartedAt = Date.now();
      console.log(`  ↳ Caching page ${page}: ${cacheInputs.length} products`);
      const statuses = await upsertSourceProducts(db, cacheInputs, matchContextHash);
      console.log(`  ↳ Cached page ${page} in ${Date.now() - upsertStartedAt}ms`);
      const statusById = new Map(statuses.map(status => [status.externalId, status]));
      const isUnchangedFullPage =
        products.length === PAGE_SIZE &&
        statuses.every(status => !status.isNew && !status.changed && !status.shouldMatch);

      consecutiveUnchangedPages = isUnchangedFullPage ? consecutiveUnchangedPages + 1 : 0;

      const matchStartedAt = Date.now();
      let pageProcessed = 0;
      let pageMatched = 0;
      for (const cacheInput of cacheInputs) {
        const status = statusById.get(cacheInput.externalId) as SourceProductCacheStatus | undefined;
        if (!status?.shouldMatch) {
          skipped++;
          continue;
        }

        const raw = toRawListing(cacheInput);
        if (!raw) {
          skipped++;
          continue;
        }

        processed++;
        pageProcessed++;
        const result = await processListingWithCache(
          db,
          raw,
          watchlistEntries,
          watchlistNameSet,
          allPlayerNames
        );

        matchedCacheRows.push({
          externalId: cacheInput.externalId,
          contentHash: cacheInput.contentHash,
        });

        if (result.matched) {
          matched++;
          pageMatched++;
          console.log(`  ★ ${result.matchType} Match: "${raw.title}" → ${result.playerName}`);
        }
      }
      console.log(`  ↳ Matched page ${page} in ${Date.now() - matchStartedAt}ms. Processed: ${pageProcessed}, matched: ${pageMatched}`);

      if (products.length < PAGE_SIZE) {
        reachedEnd = true;
      }
    }

    if (reachedEnd || consecutiveUnchangedPages >= EARLY_STOP_UNCHANGED_PAGES) {
      if (consecutiveUnchangedPages >= EARLY_STOP_UNCHANGED_PAGES) {
        stoppedEarlyFromCache = true;
        console.log(`  ↳ Early stop: ${consecutiveUnchangedPages} unchanged pages in a row`);
      }
      break;
    }

    page += PAGE_CONCURRENCY;
    await randomDelay();
  }

  await markSourceProductsMatched(db, source.slug, matchedCacheRows, matchContextHash);
  const markedOOS =
    !hadFetchError && !stoppedEarlyFromCache
      ? await markMissingSourceProductsOOS(db, source.slug, scanToken)
      : 0;

  console.log(
    `  ↳ Source done. Fetched: ${fetched}, Processed: ${processed}, Skipped cache: ${skipped}, Matched: ${matched}, Marked OOS: ${markedOOS}`
  );

  return { fetched, processed, skipped, matched, markedOOS };
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
  const watchlistEntries = await getActiveWatchlistPlayers(db);
  const watchlistNameSet = new Set(watchlistEntries.map(w => w.player_name.toLowerCase()));
  const allPlayerNames = await getAllChecklistPlayerNames(db);
  const matchContextHash = buildMatchContextHash(watchlistEntries);
  const runToken = `${Date.now()}-${crypto.randomUUID()}`;

  console.log(`  Mode: ${options.mode} | User watchlist targets: ${watchlistEntries.length}`);

  if (options.mode === 'watchlist' && watchlistEntries.length === 0) {
    console.log('  ⚠ No active user watchlists. Add targets at /watchlists first.');
    return { processed: 0, matched: 0 };
  }

  const results = [];

  for (const source of sources) {
    const sourceResult = await processSource(
        db,
        source,
        `${runToken}-${source.slug}`,
        matchContextHash,
        watchlistEntries,
        watchlistNameSet,
        allPlayerNames
      );
    results.push(sourceResult);

    if (options.onProgress) {
      await options.onProgress({
        processed: results.reduce((sum, result) => sum + result.processed, 0),
        matched: results.reduce((sum, result) => sum + result.matched, 0),
      });
    }

    await randomDelay();
  }

  const totalFetched = results.reduce((sum, result) => sum + result.fetched, 0);
  const totalProcessed = results.reduce((sum, result) => sum + result.processed, 0);
  const totalSkipped = results.reduce((sum, result) => sum + result.skipped, 0);
  const totalMatched = results.reduce((sum, result) => sum + result.matched, 0);
  const totalMarkedOOS = results.reduce((sum, result) => sum + result.markedOOS, 0);

  console.log(
    `\n✅ Ingestion complete. Fetched: ${totalFetched}, Processed: ${totalProcessed}, Skipped cache: ${totalSkipped}, Matched: ${totalMatched}, Marked OOS: ${totalMarkedOOS}`
  );

  return { processed: totalProcessed, matched: totalMatched };
}
