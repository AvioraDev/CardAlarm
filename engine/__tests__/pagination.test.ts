import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  clampPageSize,
  pageHref,
  pageOffset,
  pageWindow,
  parsePage,
} from '../../web/src/lib/pagination';

describe('customer pagination helpers', () => {
  describe('parsePage', () => {
    it('accepts plain positive integers', () => {
      expect(parsePage('2')).toBe(2);
      expect(parsePage('1')).toBe(1);
      expect(parsePage('10000')).toBe(10000);
    });

    it('falls back to page 1 for anything else', () => {
      for (const raw of ['0', '-1', 'abc', '1e3', '007', '', ' 2', '2.5', undefined]) {
        expect(parsePage(raw)).toBe(1);
      }
    });

    it('uses the first value of a repeated param', () => {
      expect(parsePage(['3', '5'])).toBe(3);
      expect(parsePage(['abc', '5'])).toBe(1);
      expect(parsePage([])).toBe(1);
    });

    it('rejects oversized input and caps at MAX_PAGE', () => {
      expect(parsePage('999999')).toBe(1);
      expect(parsePage('99999')).toBe(MAX_PAGE);
    });
  });

  describe('clampPageSize', () => {
    it('defaults, truncates and clamps', () => {
      expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(500)).toBe(MAX_PAGE_SIZE);
      expect(clampPageSize(0)).toBe(1);
      expect(clampPageSize(-4)).toBe(1);
      expect(clampPageSize(12.7)).toBe(12);
      expect(clampPageSize(48)).toBe(48);
    });
  });

  describe('pageOffset', () => {
    it('is zero-based and never negative', () => {
      expect(pageOffset(1, 48)).toBe(0);
      expect(pageOffset(3, 48)).toBe(96);
      expect(pageOffset(0, 48)).toBe(0);
    });
  });

  describe('pageWindow', () => {
    it('describes an empty result set as one empty page', () => {
      expect(pageWindow(0, 1, 48)).toEqual({
        page: 1,
        pageSize: 48,
        total: 0,
        pageCount: 1,
        start: 0,
        end: 0,
        hasPrevious: false,
        hasNext: false,
      });
    });

    it('computes the last partial page', () => {
      const window = pageWindow(100, 3, 48);
      expect(window.pageCount).toBe(3);
      expect(window.start).toBe(97);
      expect(window.end).toBe(100);
      expect(window.hasPrevious).toBe(true);
      expect(window.hasNext).toBe(false);
    });

    it('computes a middle page', () => {
      const window = pageWindow(100, 2, 48);
      expect(window.start).toBe(49);
      expect(window.end).toBe(96);
      expect(window.hasPrevious).toBe(true);
      expect(window.hasNext).toBe(true);
    });

    it('handles an exact multiple of the page size', () => {
      const window = pageWindow(96, 2, 48);
      expect(window.pageCount).toBe(2);
      expect(window.end).toBe(96);
      expect(window.hasNext).toBe(false);
    });
  });

  describe('pageHref', () => {
    it('omits page 1 and the query string when nothing is left', () => {
      expect(pageHref('/saved', {}, 1)).toBe('/saved');
      expect(pageHref('/saved', {}, 2)).toBe('/saved?page=2');
    });

    it('drops empty values and any existing page key', () => {
      expect(pageHref('/dashboard', { source: '', year: undefined, page: '7' }, 1)).toBe('/dashboard');
      expect(pageHref('/dashboard', { page: '7', isSerial: '1' }, 3)).toBe('/dashboard?isSerial=1&page=3');
    });

    it('preserves the watchlist and filters and encodes values', () => {
      const href = pageHref('/dashboard', { watchlistId: '42', player: 'Kevin Durant', search: 'gold & silver' }, 2);
      const url = new URL(href, 'https://example.test');
      expect(url.pathname).toBe('/dashboard');
      expect(url.searchParams.get('watchlistId')).toBe('42');
      expect(url.searchParams.get('player')).toBe('Kevin Durant');
      expect(url.searchParams.get('search')).toBe('gold & silver');
      expect(url.searchParams.get('page')).toBe('2');
      expect(href).not.toContain(' ');
      expect(href).toContain('player=Kevin+Durant');
    });
  });
});
