import { ChecklistLookupCache } from '../src/match';
import type { ChecklistRow } from '../src/types';

function row(overrides: Partial<ChecklistRow>): ChecklistRow {
  return {
    id: 1,
    year: 2025,
    set_name: '2024-25 Panini Prizm',
    card_number: '241',
    player_name: 'Victor Wembanyama',
    ...overrides,
  };
}

describe('ChecklistLookupCache', () => {
  it('resolves direct card number hits from preloaded rows', () => {
    const cache = new ChecklistLookupCache([
      row({ card_number: '241', player_name: 'Victor Wembanyama' }),
    ]);

    expect(cache.getByNumber('241')).toHaveLength(1);
    expect(cache.getByNumber('241')[0]!.player_name).toBe('Victor Wembanyama');
  });

  it('resolves set-context hits without another database lookup', () => {
    const cache = new ChecklistLookupCache([
      row({
        set_name: '2024-25 Panini Prizm - Silver',
        card_number: '241',
        player_name: 'Victor Wembanyama',
      }),
      row({
        id: 2,
        set_name: '2024-25 Panini Select',
        card_number: '241',
        player_name: 'Chris Paul',
      }),
    ]);

    expect(cache.getBySetAndNumber('Panini Prizm Silver', '241')?.player_name).toBe('Victor Wembanyama');
  });

  it('tracks no-hit card numbers so scans do not re-query misses', () => {
    const cache = new ChecklistLookupCache();

    expect(cache.missingCardNumbers(['999'])).toEqual(['999']);
    cache.markLoaded(['999']);

    expect(cache.getByNumber('999')).toEqual([]);
    expect(cache.missingCardNumbers(['999'])).toEqual([]);
  });

  it('deduplicates card numbers before page-level preload', () => {
    const cache = new ChecklistLookupCache([
      row({ card_number: '241' }),
    ]);

    expect(cache.missingCardNumbers(['241', '999', '999', '  '])).toEqual(['999']);
  });
});
