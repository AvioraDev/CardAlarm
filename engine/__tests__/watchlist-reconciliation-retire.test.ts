import { reconcileActiveWatchlistMatches } from '../src/watchlist-reconciliation';

// CAR-71: matches that stop matching must be retired, but only after a successful upsert.
type Call = { sql: string; params?: unknown[] };

function fakeDb(options: { failInsert?: boolean } = {}) {
  const calls: Call[] = [];
  const startedAt = new Date('2026-10-12T00:00:00Z');
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('clock_timestamp')) return { rows: [{ started_at: startedAt }], rowCount: 1 };
      if (sql.includes('insert into public.watchlist_matches')) {
        if (options.failInsert) throw new Error('insert failed');
        return { rows: [], rowCount: 3 };
      }
      return { rows: [], rowCount: 2 };
    },
  };
  return { db: db as never, calls, startedAt };
}

describe('watchlist reconciliation retires stale matches (CAR-71)', () => {
  it('reads the clock, upserts, then deletes only rows this run did not refresh', async () => {
    const { db, calls, startedAt } = fakeDb();
    const upserted = await reconcileActiveWatchlistMatches(db);

    expect(upserted).toBe(3);
    expect(calls.map(c => (c.sql.includes('update public.watchlist_rules') ? 'link players' : c.sql.includes('clock_timestamp') ? 'clock' : c.sql.includes('insert into') ? 'insert' : 'delete'))).toEqual([
      'link players',
      'clock',
      'insert',
      'delete',
    ]);
    expect(calls[3]!.params).toEqual([startedAt]);
    expect(calls[3]!.sql).toContain('wm.last_matched_at < $1');
  });

  it('only retires matches on active watchlists and still-available listings', async () => {
    const { db, calls } = fakeDb();
    await reconcileActiveWatchlistMatches(db);
    const sql = calls[3]!.sql.replace(/\s+/g, ' ');

    expect(sql).toContain('w.is_active = true');
    expect(sql).toContain('sp.is_active = true');
    expect(sql).toContain('sp.current_availability = true');
  });

  it('retires nothing when the upsert fails', async () => {
    const { db, calls } = fakeDb({ failInsert: true });
    await expect(reconcileActiveWatchlistMatches(db)).rejects.toThrow('insert failed');
    expect(calls.some(c => c.sql.includes('delete from public.watchlist_matches'))).toBe(false);
  });
});
