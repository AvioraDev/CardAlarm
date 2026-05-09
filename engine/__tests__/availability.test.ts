import Database from 'better-sqlite3';
import {
  setDb,
  closeDb,
  upsertListing,
  getActiveFeed,
  markOOS,
  dismissListing,
  upsertSourceProducts,
  markSourceProductsMatched,
  reconcileSourceAvailability,
} from '../src/sqlite-test-db';
import type { ListingInsert, SourceProductCacheInput } from '../src/types';

/** Test helper: create a ListingInsert with metadata defaults */
function makeListing(overrides: Partial<ListingInsert> & Pick<ListingInsert, 'externalId' | 'source' | 'title' | 'price' | 'url' | 'matchType'>): ListingInsert {
  return {
    imageUrl: '',
    year: null,
    setName: null,
    cardNumber: null,
    playerName: null,
    variant: null,
    isSerial: false,
    serialNumber: null,
    serialCurrent: null,
    serialLimit: null,
    isAuto: false,
    isRookie: false,
    category: 'NBA',
    matchConfidence: 0.9,
    matchStatus: 'confirmed',
    matchReasons: ['test fixture'],
    unmatchedFields: [],
    matcherVersion: 'test',
    ...overrides,
  };
}

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  setDb(db);
});

afterEach(() => {
  closeDb();
});

// ─── US-2.2: Availability Enforcement ──────────────────────────────

describe('Availability Enforcement (US-2.2)', () => {
  it('discards out-of-stock items (not inserted)', () => {
    const listing = makeListing({
      externalId: 'oos-001',
      source: 'test-store',
      title: 'Test Card #1',
      price: 10.0,
      url: 'https://test.com/products/card-1',
      matchType: 'Direct',
    });

    // Insert, then immediately mark OOS
    upsertListing(db, listing);
    markOOS(db, 'oos-001', 'test-store');

    const feed = getActiveFeed(db);
    expect(feed).toHaveLength(0);
  });

  it('purges stale dashboard items by marking OOS', () => {
    const listing = makeListing({
      externalId: 'stale-001',
      source: 'test-store',
      title: 'Test Card #99',
      price: 25.0,
      url: 'https://test.com/products/card-99',
      matchType: 'Stealth',
    });

    upsertListing(db, listing);

    // Before OOS mark
    let feed = getActiveFeed(db);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.is_oos).toBe(0);

    // Simulate watchdog detecting product is gone
    markOOS(db, 'stale-001', 'test-store');

    // After OOS mark — hidden from active feed
    feed = getActiveFeed(db);
    expect(feed).toHaveLength(0);

    // Verify DB record still exists but flagged
    const allRows = db.prepare('SELECT * FROM listings_feed WHERE external_id = ?').all('stale-001') as Array<{ is_oos: number }>;
    expect(allRows).toHaveLength(1);
    expect(allRows[0]!.is_oos).toBe(1);
  });
});

// ─── US-3.2: The Kill Switch ───────────────────────────────────────

describe('Dashboard Interaction - Kill Switch (US-3.2)', () => {
  it('updates database state on dismiss', () => {
    const listing = makeListing({
      externalId: 'dismiss-001',
      source: 'test-store',
      title: 'Dismiss Me #123',
      price: 5.0,
      url: 'https://test.com/products/dismiss',
      matchType: 'Direct',
    });

    upsertListing(db, listing);

    // Get the inserted row ID
    const feed = getActiveFeed(db);
    expect(feed).toHaveLength(1);
    const listingId = feed[0]!.id;

    // Dismiss it
    dismissListing(db, listingId);

    // Verify it's gone from active feed
    const postDismissFeed = getActiveFeed(db);
    expect(postDismissFeed).toHaveLength(0);

    // Verify DB record still exists but flagged
    const row = db.prepare('SELECT is_dismissed FROM listings_feed WHERE id = ?').get(listingId) as { is_dismissed: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.is_dismissed).toBe(1);
  });
});

describe('Source Product Cache', () => {
  function makeSourceProduct(
    overrides: Partial<SourceProductCacheInput> = {}
  ): SourceProductCacheInput {
    return {
      storeId: null,
      source: 'test-store',
      externalId: 'product-001',
      handle: 'card-1',
      title: '2025 Panini Prizm #1 Test Player',
      price: 10,
      available: true,
      url: 'https://test.com/products/card-1',
      imageUrl: '',
      description: '',
      rawPayload: '{}',
      contentHash: 'hash-a',
      scanToken: 'scan-a',
      ...overrides,
    };
  }

  it('matches new products once, then skips unchanged products in the same context', () => {
    const product = makeSourceProduct();
    const contextHash = 'watchlist-context-a';

    const first = upsertSourceProducts(db, [product], contextHash);
    expect(first[0]!.isNew).toBe(true);
    expect(first[0]!.shouldMatch).toBe(true);

    markSourceProductsMatched(
      db,
      product.source,
      [{ externalId: product.externalId, contentHash: product.contentHash }],
      contextHash
    );

    const second = upsertSourceProducts(
      db,
      [{ ...product, scanToken: 'scan-b' }],
      contextHash
    );
    expect(second[0]!.isNew).toBe(false);
    expect(second[0]!.changed).toBe(false);
    expect(second[0]!.shouldMatch).toBe(false);
  });

  it('reprocesses unchanged cached products when the match context changes', () => {
    const product = makeSourceProduct();

    upsertSourceProducts(db, [product], 'watchlist-context-a');
    markSourceProductsMatched(
      db,
      product.source,
      [{ externalId: product.externalId, contentHash: product.contentHash }],
      'watchlist-context-a'
    );

    const afterWatchlistChange = upsertSourceProducts(
      db,
      [{ ...product, scanToken: 'scan-b' }],
      'watchlist-context-b'
    );

    expect(afterWatchlistChange[0]!.shouldMatch).toBe(true);
  });

  it('reconciles source inventory into OOS feed rows', () => {
    const activeProduct = makeSourceProduct({ externalId: 'active-001', handle: 'active' });
    const missingProduct = makeSourceProduct({
      externalId: 'missing-001',
      handle: 'missing',
      contentHash: 'hash-missing',
    });

    upsertSourceProducts(db, [activeProduct, missingProduct], 'context');
    upsertListing(db, makeListing({
      externalId: 'active-001',
      source: 'test-store',
      title: 'Active Card #1',
      price: 10,
      url: 'https://test.com/products/active',
      matchType: 'Direct',
    }));
    upsertListing(db, makeListing({
      externalId: 'missing-001',
      source: 'test-store',
      title: 'Missing Card #2',
      price: 12,
      url: 'https://test.com/products/missing',
      matchType: 'Direct',
    }));

    const marked = reconcileSourceAvailability(db, 'test-store', ['active-001']);

    expect(marked).toBe(1);
    const feed = getActiveFeed(db);
    expect(feed.map(row => row.external_id)).toEqual(['active-001']);
  });
});
