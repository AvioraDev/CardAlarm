import {
  cardAltText,
  cardImageSrc,
  cardImageSrcSet,
  confidencePercent,
  customerReasons,
  formatCheckedAgo,
  formatPrice,
  matchTier,
  safeListingHref,
  tierLabel,
} from '../../web/src/lib/match-display';

describe('matchTier and labels', () => {
  it('classifies match tiers', () => {
    expect(matchTier('possible', 0.95)).toBe('possible');
    expect(matchTier('confirmed', 0.94)).toBe('strong');
    expect(matchTier('confirmed', 0.8)).toBe('confirmed');
    expect(matchTier(null, null)).toBe('unmatched');
    expect(matchTier(null, 0)).toBe('unmatched');
    expect(matchTier(null, 0.8)).toBe('confirmed');
  });

  it('labels tiers in plain English', () => {
    expect(tierLabel('strong')).toBe('Strong match');
    expect(tierLabel('confirmed')).toBe('Confirmed match');
    expect(tierLabel('possible')).toBe('Possible match');
    expect(tierLabel('unmatched')).toBe('Not matched yet');
  });

  it('hides unknown confidence', () => {
    expect(confidencePercent(null)).toBeNull();
    expect(confidencePercent(0)).toBeNull();
    expect(confidencePercent(0.684)).toBe('68%');
  });
});

describe('customerReasons', () => {
  const table: Array<[string, string]> = [
    ['Watchlist player name found in title', 'Player name in listing'],
    ['Watchlist target card number matched', 'Card number matches your watchlist'],
    ['Checklist matched by set context and card number', 'Set and card number match the checklist'],
    ['Card number resolved to one unique checklist player', 'Card number matches one player on the checklist'],
    ['Card number extracted', 'Card number found'],
    ['Serialized card detected', 'Numbered card'],
    ['Serial number 12/99', 'Numbered 12/99'],
    ['Rookie indicator detected', 'Rookie card'],
    ['Autograph indicator detected', 'Autograph'],
    ['Case hit detected: Kaboom', 'Case hit: Kaboom'],
    ['Insert detected: Downtown', 'Insert: Downtown'],
    ['Variation detected: Photo variation', 'Variation: Photo variation'],
    ['Short print detected: SSP', 'Short print: SSP'],
    ['Parallel detected: Silver Prizm', 'Parallel: Silver Prizm'],
    ['Serialized parallel detected', 'Numbered parallel'],
    ['Low serialized run', 'Low numbered run'],
  ];

  it.each(table)('maps %s', (raw, expected) => {
    expect(customerReasons([raw], 5)).toEqual([expected]);
  });

  it('never shows serial wording for serialized cards', () => {
    const [reason] = customerReasons(['Serialized card detected']);
    expect(reason).toBeDefined();
    expect(reason).not.toMatch(/serial/i);
  });

  it('drops missing card number reasons', () => {
    expect(customerReasons(['No card number extracted'])).toEqual([]);
  });

  it('orders identity reasons first, de-duplicates and caps at 2 by default', () => {
    expect(
      customerReasons([
        'Rookie indicator detected',
        'Serialized card detected',
        'Watchlist player name found in title',
        'Watchlist player name found in title',
        'Card number extracted',
      ]),
    ).toEqual(['Player name in listing', 'Card number found']);
    expect(customerReasons(['Rookie indicator detected', 'Rookie indicator detected'], 5)).toEqual(['Rookie card']);
  });

  it('drops internal wording and truncates long reasons', () => {
    expect(customerReasons(['Matched via backfill', 'Canonical card linked', 'MVP heuristic', 'Cached listing reused'], 5)).toEqual([]);
    const [long] = customerReasons(['x'.repeat(120)]);
    expect(long).toBeDefined();
    expect(long!.length).toBeLessThanOrEqual(60);
    expect(long!.endsWith('…')).toBe(true);
  });

  it('handles empty input', () => {
    expect(customerReasons(null)).toEqual([]);
    expect(customerReasons(undefined)).toEqual([]);
  });
});

describe('cardAltText', () => {
  const base = {
    player_name: 'Victor Wembanyama',
    year: '2023-24',
    set_name: 'Panini Prizm',
    card_number: '136',
    variant: 'Silver Prizm',
    store_name: 'Example Hobby Store',
  };

  it('builds alt text from parsed fields', () => {
    expect(cardAltText(base)).toBe('Victor Wembanyama 2023-24 Panini Prizm #136 Silver Prizm card photo');
  });

  it('never reads the store title', () => {
    const withTitle = { ...base, player_name: null, title: '<script>alert(1)</script> Wemby' };
    const alt = cardAltText(withTitle);
    expect(alt).not.toContain('<script>');
    expect(alt).not.toContain('Wemby');
  });

  it('falls back to the store name and strips control characters', () => {
    expect(cardAltText({ player_name: null, year: null, set_name: null, card_number: null, variant: null, store_name: 'Shop' })).toBe(
      'Card photo from Shop',
    );
    expect(cardAltText({ ...base, player_name: 'A\u0000B\nC' })).toContain('A B C');
  });

  it('caps length', () => {
    const alt = cardAltText({ ...base, player_name: 'y'.repeat(400) });
    expect(alt.length).toBeLessThanOrEqual(130);
    expect(alt.endsWith(' card photo')).toBe(true);
  });
});

describe('image and link sanitising', () => {
  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,iVBORw0KGgo=',
    'https://user:pw@x.com/a.jpg',
    'ftp://x.com/a.jpg',
    '',
    '   ',
    'not a url',
  ])('rejects %s', (raw) => {
    expect(cardImageSrc(raw, 480)).toBeNull();
    expect(cardImageSrcSet(raw)).toBeUndefined();
  });

  it('upgrades protocol-relative Shopify URLs and adds width', () => {
    expect(cardImageSrc('//cdn.shopify.com/a.jpg', 480)).toBe('https://cdn.shopify.com/a.jpg?width=480');
  });

  it('upgrades http without adding width for other hosts', () => {
    expect(cardImageSrc('http://store.com/a.jpg', 480)).toBe('https://store.com/a.jpg');
    expect(cardImageSrcSet('http://store.com/a.jpg')).toBeUndefined();
  });

  it('resizes store-domain Shopify paths', () => {
    expect(cardImageSrc('https://store.com/cdn/shop/files/a.jpg?v=1', 480)).toBe('https://store.com/cdn/shop/files/a.jpg?v=1&width=480');
    expect(cardImageSrcSet('https://store.com/cdn/shop/files/a.jpg')).toBe(
      'https://store.com/cdn/shop/files/a.jpg?width=320 320w, https://store.com/cdn/shop/files/a.jpg?width=480 480w, https://store.com/cdn/shop/files/a.jpg?width=720 720w',
    );
  });

  it('only allows http(s) listing links', () => {
    expect(safeListingHref('javascript:alert(1)')).toBe('#');
    expect(safeListingHref('data:text/html,hi')).toBe('#');
    expect(safeListingHref('https://store.com/products/x')).toBe('https://store.com/products/x');
  });
});

describe('formatPrice', () => {
  it('formats with the store currency', () => {
    expect(formatPrice(249, 'NZD')).toBe('$249.00');
    expect(formatPrice(249, 'AUD')).toBe('A$249.00');
    expect(formatPrice('120', 'USD')).toBe('US$120.00');
  });

  it('falls back without a currency and handles missing prices', () => {
    expect(formatPrice(12.5, null)).toBe('$12.50');
    expect(formatPrice(12.5, 'bad')).toBe('$12.50');
    expect(formatPrice(null, 'NZD')).toBe('Price unavailable');
    expect(formatPrice('abc', null)).toBe('Price unavailable');
  });
});

describe('formatCheckedAgo', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');

  it('formats relative times', () => {
    expect(formatCheckedAgo(null, now)).toBeNull();
    expect(formatCheckedAgo('2026-10-10T11:59:30.000Z', now)).toBe('Checked just now');
    expect(formatCheckedAgo('2026-10-10T13:00:00.000Z', now)).toBe('Checked just now');
    expect(formatCheckedAgo('2026-10-10T11:15:00.000Z', now)).toBe('Checked 45 min ago');
    expect(formatCheckedAgo('2026-10-10T07:00:00.000Z', now)).toBe('Checked 5 h ago');
    expect(formatCheckedAgo('2026-10-07T12:00:00.000Z', now)).toBe('Checked 3 d ago');
  });
});
