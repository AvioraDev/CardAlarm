import type { DbClient } from './db';
import type { SourceConfig, ShopifyProductsResponse } from './types';
import { reconcileSourceAvailability } from './db';

const PAGE_SIZE = 250;
const PAGE_CONCURRENCY = 1;

function randomDelay(): Promise<void> {
  const ms = 2000 + Math.floor(Math.random() * 3000);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function fetchProductPage(
  baseUrl: string,
  page: number
): Promise<ShopifyProductsResponse['products'] | null> {
  const url = `${normalizeBaseUrl(baseUrl)}/products.json?limit=${PAGE_SIZE}&page=${page}`;
  console.log(`  ↳ Availability page ${page}: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  ✗ HTTP ${response.status} from ${url}`);
      return null;
    }

    const data = (await response.json()) as ShopifyProductsResponse;
    return data.products ?? [];
  } catch (err) {
    console.error(`  ✗ Network error fetching ${url}:`, err);
    return null;
  }
}

async function fetchAvailableProductIds(source: SourceConfig): Promise<{
  complete: boolean;
  availableExternalIds: string[];
  fetched: number;
}> {
  let page = 1;
  let complete = true;
  let reachedEnd = false;
  let fetched = 0;
  const availableExternalIds: string[] = [];

  while (!reachedEnd) {
    const pageNumbers = Array.from({ length: PAGE_CONCURRENCY }, (_, index) => page + index);
    const pages = await Promise.all(pageNumbers.map(pageNumber => fetchProductPage(source.baseUrl, pageNumber)));

    for (const products of pages) {
      if (!products) {
        complete = false;
        reachedEnd = true;
        continue;
      }

      if (products.length === 0) {
        reachedEnd = true;
        continue;
      }

      fetched += products.length;

      for (const product of products) {
        if (product.variants[0]?.available) {
          availableExternalIds.push(String(product.id));
        }
      }

      if (products.length < PAGE_SIZE) {
        reachedEnd = true;
      }
    }

    if (!reachedEnd) {
      page += PAGE_CONCURRENCY;
      await randomDelay();
    }
  }

  return { complete, availableExternalIds, fetched };
}

export async function runAvailabilityCheck(
  db: DbClient,
  sources: SourceConfig[]
): Promise<{ checked: number; markedOOS: number }> {
  let checked = 0;
  let markedOOS = 0;

  for (const source of sources) {
    console.log(`\n▶ Availability inventory: ${source.name}`);
    const result = await fetchAvailableProductIds(source);

    if (!result.complete) {
      console.warn(`  ⚠ Skipping OOS reconciliation for ${source.slug}; source fetch was incomplete`);
      continue;
    }

    const sourceMarkedOOS = await reconcileSourceAvailability(
      db,
      source.slug,
      result.availableExternalIds
    );

    checked += result.fetched;
    markedOOS += sourceMarkedOOS;

    console.log(
      `  ↳ Availability done. Fetched: ${result.fetched}, Available: ${result.availableExternalIds.length}, Marked OOS: ${sourceMarkedOOS}`
    );

    await randomDelay();
  }

  console.log(`\n✅ Availability check complete. Checked products: ${checked}, Marked OOS: ${markedOOS}`);
  return { checked, markedOOS };
}
