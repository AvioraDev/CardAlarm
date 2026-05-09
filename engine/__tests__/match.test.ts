import Database from 'better-sqlite3';
import { setDb, closeDb, upsertListing, getActiveFeed } from '../src/sqlite-test-db';
import { processListing, checkMatch, titleContainsPlayerName } from '../src/sqlite-match';
import type { RawListing } from '../src/types';

let db: Database.Database;

function seedTestDb(): void {
  // Seed reference_checklists
  db.exec(`
    INSERT INTO reference_checklists (year, set_name, card_number, player_name) VALUES
      (2025, '2025 Prizm', '241', 'Victor Wembanyama'),
      (2025, '2025 Prizm', '15', 'Steven Adams'),
      (2025, '2025 Prizm', '100', 'LeBron James'),
      (2025, '2025 Prizm', '7', 'LeBron James'),
      (2025, '2025 Select', '7', 'Chris Paul'),
      (2025, '2025 Chronicles', '24', 'LeBron James'),
      (2025, '2025 Recon', '24', 'Jayson Tatum'),
      (2024, '2024-25 Panini Prizm - Silver', '241', 'Victor Wembanyama');
  `);

  // Seed watchlist
  db.exec(`
    INSERT INTO watchlist (player_name, variants, is_active) VALUES
      ('Victor Wembanyama', 'Silver,Prizm,Holo', 1),
      ('LeBron James', 'Gold', 1);
  `);
}

beforeEach(() => {
  db = new Database(':memory:');
  setDb(db);
  seedTestDb();
});

afterEach(() => {
  closeDb();
});

// ─── US-2.3: Stealth Match ─────────────────────────────────────────

describe('Stealth Match Engine (US-2.3)', () => {
  it('correctly identifies player from raw card number', () => {
    // automation-tests.md Test 1: extract #241, resolve to Wembanyama, flag as Stealth
    const listing: RawListing = {
      externalId: 'test-001',
      source: 'test-store',
      title: 'Panini Prizm Silver #241 Mint',
      price: 50.0,
      url: 'https://test.com/products/prizm-241',
      imageUrl: 'https://test.com/img.jpg',
    };

    const result = processListing(db, listing);

    expect(result.matched).toBe(true);
    expect(result.matchType).toBe('Stealth');
    expect(result.playerName).toBe('Victor Wembanyama');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    expect(result.reasons.length).toBeGreaterThan(0);

    // Verify it was inserted into listings_feed
    const feed = getActiveFeed(db);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.external_id).toBe('test-001');
    expect(feed[0]!.match_type).toBe('Stealth');
    expect(feed[0]!.match_confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('ignores false positive number matches', () => {
    // automation-tests.md Test 2: #15 resolves to Steven Adams, not on watchlist
    const listing: RawListing = {
      externalId: 'test-002',
      source: 'test-store',
      title: 'Panini Prizm Silver #15',
      price: 10.0,
      url: 'https://test.com/products/prizm-15',
      imageUrl: 'https://test.com/img.jpg',
    };

    const result = processListing(db, listing);

    expect(result.matched).toBe(false);
    expect(result.matchType).toBeNull();

    // Verify nothing was inserted
    const feed = getActiveFeed(db);
    expect(feed).toHaveLength(0);
  });

  it('detects Direct Match when player name is in title', () => {
    const listing: RawListing = {
      externalId: 'test-003',
      source: 'test-store',
      title: '2024-25 Panini Prizm #241 Victor Wembanyama Silver',
      price: 150.0,
      url: 'https://test.com/products/wemby-241',
      imageUrl: 'https://test.com/img.jpg',
    };

    const result = processListing(db, listing);

    expect(result.matched).toBe(true);
    expect(result.matchType).toBe('Direct');
    expect(result.playerName).toBe('Victor Wembanyama');
    expect(result.status).toBe('confirmed');
    expect(result.reasons).toContain('Watchlist player name found in title');
  });

  it('persists serial details and match reasons for serialized matches', () => {
    const listing: RawListing = {
      externalId: 'test-serial-001',
      source: 'test-store',
      title: '2024-25 Panini Prizm #241 Victor Wembanyama Gold 07/25',
      price: 500.0,
      url: 'https://test.com/products/wemby-serial',
      imageUrl: 'https://test.com/img.jpg',
    };

    const result = processListing(db, listing);

    expect(result.matched).toBe(true);
    expect(result.reasons).toContain('Serial number 07/25');

    const feed = getActiveFeed(db);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.is_serial).toBe(1);
    expect(feed[0]!.serial_current).toBe('07');
    expect(feed[0]!.serial_limit).toBe('25');
    expect(feed[0]!.match_reasons).toContain('Serial number 07/25');
  });

  it('adds specific insert, case hit, short print, variation, and parallel reasons without changing confidence rules', () => {
    const silver: RawListing = {
      externalId: 'reason-silver',
      source: 'test-store',
      title: '2024-25 Panini Prizm Silver #100 LeBron James',
      price: 50,
      url: 'https://test.com/products/silver',
      imageUrl: '',
    };
    const downtown: RawListing = {
      externalId: 'reason-downtown',
      source: 'test-store',
      title: '2023 Panini Donruss Downtown #100 LeBron James',
      price: 50,
      url: 'https://test.com/products/downtown',
      imageUrl: '',
    };
    const kaboom: RawListing = {
      externalId: 'reason-kaboom',
      source: 'test-store',
      title: '2023-24 Panini Crown Royale Kaboom #100 LeBron James',
      price: 50,
      url: 'https://test.com/products/kaboom',
      imageUrl: '',
    };
    const imageVariation: RawListing = {
      externalId: 'reason-variation',
      source: 'test-store',
      title: '2024 Topps Chrome Baseball Image Variation #100 LeBron James',
      price: 50,
      url: 'https://test.com/products/variation',
      imageUrl: '',
    };
    const shortPrint: RawListing = {
      externalId: 'reason-ssp',
      source: 'test-store',
      title: '2024 Panini Select SSP #100 LeBron James',
      price: 50,
      url: 'https://test.com/products/ssp',
      imageUrl: '',
    };

    const silverResult = processListing(db, silver);
    const downtownResult = processListing(db, downtown);
    const kaboomResult = processListing(db, kaboom);
    const variationResult = processListing(db, imageVariation);
    const shortPrintResult = processListing(db, shortPrint);

    expect(silverResult.confidence).toBe(0.94);
    expect(silverResult.reasons).toContain('Parallel detected: Silver');
    expect(downtownResult.reasons).toContain('Insert detected: Downtown');
    expect(kaboomResult.reasons).toContain('Case hit detected: Kaboom');
    expect(variationResult.reasons).toContain('Variation detected: Image Variation');
    expect(shortPrintResult.reasons).toContain('Short print detected: SSP');
  });

  it('rejects Direct Match for non-card memorabilia', () => {
    const listing: RawListing = {
      externalId: 'test-poster-001',
      source: 'test-store',
      title: 'LeBron James L.A. Lakers NBA Poster Framed',
      price: 35.0,
      url: 'https://test.com/products/lebron-poster',
      imageUrl: 'https://test.com/img.jpg',
    };

    const result = processListing(db, listing);

    expect(result.matched).toBe(false);
    expect(result.matchType).toBeNull();
    expect(getActiveFeed(db)).toHaveLength(0);
  });

  it('does not insert duplicates (same external_id + source)', () => {
    const listing: RawListing = {
      externalId: 'test-004',
      source: 'test-store',
      title: 'Panini Prizm Silver #241 Mint',
      price: 50.0,
      url: 'https://test.com/products/prizm-241',
      imageUrl: 'https://test.com/img.jpg',
    };

    processListing(db, listing);
    processListing(db, listing); // duplicate

    const feed = getActiveFeed(db);
    expect(feed).toHaveLength(1);
  });
});

// ─── checkMatch (dry-run) ──────────────────────────────────────────

describe('checkMatch (dry-run)', () => {
  it('returns Stealth match without inserting', () => {
    const result = checkMatch(db, 'Panini Prizm Silver #241 Mint');
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe('Stealth');
    expect(result.playerName).toBe('Victor Wembanyama');

    // Verify nothing inserted
    const feed = getActiveFeed(db);
    expect(feed).toHaveLength(0);
  });

  it('returns no match for unknown player', () => {
    const result = checkMatch(db, 'Panini Prizm Silver #15');
    expect(result.matched).toBe(false);
  });
});

// ─── titleContainsPlayerName gate ──────────────────────────────────

describe('titleContainsPlayerName', () => {
  it('detects player names after card number', () => {
    expect(titleContainsPlayerName('2023-24 Panini Prizm #7 - Devin Booker')).toBe(true);
    expect(titleContainsPlayerName('1991-92 Skybox Mini #7 - Michael Jordan')).toBe(true);
    expect(titleContainsPlayerName('2016-17 Panini Donruss Optic #62 - Derrick Rose')).toBe(true);
    expect(titleContainsPlayerName('2023-24 Panini Select No. 7 - Devin Booker')).toBe(true);
  });

  it('returns false for anonymous listings (no player after number)', () => {
    expect(titleContainsPlayerName('Panini Prizm Silver #241 Mint')).toBe(false);
    expect(titleContainsPlayerName('2025 Prizm Base Set #241')).toBe(false);
  });

  it('handles print run suffixes without false positives', () => {
    // "/149" is a print run, not a name
    expect(titleContainsPlayerName('Some Card #7 /149')).toBe(false);
  });
});

// ─── False positive gate (named non-watchlist player) ──────────────

describe('Stealth gate: named non-watchlist player', () => {
  it('rejects stealth match when title names a non-watchlist player', () => {
    // Michael Jordan is NOT on watchlist, but #7 maps to LeBron in some set.
    // The old code would match this as LeBron. The gate should block it.
    const listing: RawListing = {
      externalId: 'gate-001',
      source: 'test-store',
      title: '1991-92 Skybox Mini #7 - Michael Jordan',
      price: 100.0,
      url: 'https://test.com/products/mj-7',
      imageUrl: 'https://test.com/img.jpg',
    };

    const result = processListing(db, listing);
    expect(result.matched).toBe(false);

    const feed = getActiveFeed(db);
    expect(feed).toHaveLength(0);
  });

  it('still matches stealth when title has NO player name', () => {
    const listing: RawListing = {
      externalId: 'gate-002',
      source: 'test-store',
      title: 'Panini Prizm Silver #241 Mint',
      price: 50.0,
      url: 'https://test.com/products/prizm-241',
      imageUrl: 'https://test.com/img.jpg',
    };

    const result = processListing(db, listing);
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe('Stealth');
    expect(result.playerName).toBe('Victor Wembanyama');
  });

  it('rejects No. format title when a visible non-watchlist player appears before the number', () => {
    const listing: RawListing = {
      externalId: 'gate-003',
      source: 'icons-of-sport',
      title: '2022 Chronicles Recon Draft Picks Jayson Tatum - No. 24',
      price: 12.0,
      url: 'https://test.com/products/tatum-no-24',
      imageUrl: 'https://test.com/img.jpg',
    };

    const result = processListing(db, listing);

    expect(result.matched).toBe(false);
    expect(getActiveFeed(db)).toHaveLength(0);
  });

  it('rejects ambiguous broad card-number collisions even when one candidate is watchlisted', () => {
    const listing: RawListing = {
      externalId: 'gate-004',
      source: 'test-store',
      title: 'Panini Select Silver #7 Mint',
      price: 20.0,
      url: 'https://test.com/products/select-7',
      imageUrl: 'https://test.com/img.jpg',
    };

    const result = processListing(db, listing);

    expect(result.matched).toBe(false);
    expect(getActiveFeed(db)).toHaveLength(0);
  });
});
