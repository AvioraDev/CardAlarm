import {
  extractCardNumber,
  extractCardNumberFallback,
  extractSetContext,
  extractAll,
  extractDirectPlayerMatch,
} from '../src/extract';

// ─── extractCardNumber ─────────────────────────────────────────────

describe('extractCardNumber', () => {
  it('extracts standard numeric card numbers', () => {
    expect(extractCardNumber('Panini Prizm Silver #241 Mint')).toBe('241');
    expect(extractCardNumber('2023-24 Panini Prizm - Green Prizm #35 Damian Lillard')).toBe('35');
    expect(extractCardNumber('2017-18 Panini Chronicles - Purple #36 Dwyane Wade /149')).toBe('36');
  });

  it('extracts single-digit card numbers', () => {
    expect(extractCardNumber('2023-24 Panini Phoenix - Fire Forged #7 Damian Lillard')).toBe('7');
  });

  it('extracts alphanumeric Topps-style card numbers', () => {
    expect(extractCardNumber('2025-26 Topps #80B2-AD Some Player')).toBe('80B2-AD');
  });

  it('returns null when no card number is present', () => {
    expect(extractCardNumber('Panini Prizm Silver Base Set Mint Condition')).toBeNull();
    expect(extractCardNumber('Random product listing')).toBeNull();
  });

  it('does NOT match print run denominators', () => {
    // "/149" should not be captured — no # prefix
    const result = extractCardNumber('Some Card /149');
    expect(result).toBeNull();
  });
});

// ─── extractCardNumberFallback ─────────────────────────────────────

describe('extractCardNumberFallback', () => {
  it('extracts "No. 241" format', () => {
    expect(extractCardNumberFallback('Panini Prizm No. 241 Silver')).toBe('241');
  });

  it('extracts "No.15" format (no space)', () => {
    expect(extractCardNumberFallback('Prizm Silver No.15')).toBe('15');
  });

  it('extracts case-insensitive "no 7"', () => {
    expect(extractCardNumberFallback('some card no 7 mint')).toBe('7');
  });

  it('returns null when no No. pattern exists', () => {
    expect(extractCardNumberFallback('Panini Prizm #241')).toBeNull();
  });
});

// ─── extractSetContext ─────────────────────────────────────────────

describe('extractSetContext', () => {
  it('extracts set context from standard Shopify title', () => {
    expect(extractSetContext('2023-24 Panini Prizm - Green Prizm #35 Damian Lillard'))
      .toBe('Panini Prizm - Green Prizm');
  });

  it('extracts set context with single year', () => {
    expect(extractSetContext('2025 Panini Origins #100 Player Name'))
      .toBe('Panini Origins');
  });

  it('returns null if no year or # pattern', () => {
    expect(extractSetContext('Some random product listing')).toBeNull();
  });
});

// ─── extractAll ────────────────────────────────────────────────────

describe('extractAll', () => {
  it('returns both card number and set context', () => {
    const result = extractAll('2023-24 Panini Prizm - Green Prizm #35 Damian Lillard');
    expect(result.cardNumber).toBe('35');
    expect(result.setContext).toBe('Panini Prizm - Green Prizm');
  });

  it('falls back to No. format when # is absent', () => {
    const result = extractAll('2023-24 Panini Prizm No. 35 Damian Lillard');
    expect(result.cardNumber).toBe('35');
  });

  it('returns nulls for unparseable titles', () => {
    const result = extractAll('Random product');
    expect(result.cardNumber).toBeNull();
    expect(result.setContext).toBeNull();
  });
});

// ─── extractDirectPlayerMatch ──────────────────────────────────────

describe('extractDirectPlayerMatch', () => {
  const watchlist = ['Victor Wembanyama', 'LeBron James', 'Nikola Jokic'];

  it('matches player name in title (case-insensitive)', () => {
    expect(extractDirectPlayerMatch(
      '2024-25 Panini Prizm Silver #241 Victor Wembanyama', watchlist
    )).toBe('Victor Wembanyama');
  });

  it('matches regardless of casing', () => {
    expect(extractDirectPlayerMatch(
      'LEBRON JAMES 2024 PRIZM BASE', watchlist
    )).toBe('LeBron James');
  });

  it('returns null when no watchlist player is in the title', () => {
    expect(extractDirectPlayerMatch(
      '2024-25 Panini Prizm #15 Steven Adams', watchlist
    )).toBeNull();
  });
});
