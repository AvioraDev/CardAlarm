import { linkWatchlistPlayers } from '../src/watchlist-players';
import { reconcileActiveWatchlistMatches } from '../src/watchlist-reconciliation';

describe('free-text watchlists get their player once it exists (CAR-96)', () => {
  it('only touches rules with no player, team, set, card or variant, and links only an unambiguous exact name', async () => {
    const queries: string[] = [];
    const db = { query: async (sql: string) => { queries.push(sql); return { rows: [{ id: '16' }], rowCount: 1 }; } };
    expect(await linkWatchlistPlayers(db as never)).toEqual([16]);
    const sql = queries[0]!;
    expect(sql).toContain('wr.player_id is null');
    for (const column of ['team_id', 'set_id', 'catalogue_card_id', 'catalogue_variant_id']) expect(sql).toContain(`wr.${column} is null`);
    expect(sql).toContain('having count(distinct p.id) = 1'); // two players with one name link to neither
    expect(sql).toContain("trim(term) !~* '^(rookie|rookies|rc)$'"); // "Ajay Mitchell, Rookie" names one player
    expect(sql).toContain('c.term_count <= 1');
    expect(sql).toContain("intent_type = 'player'");
  });

  it('runs before watchlists are reconciled, on every reconcile', async () => {
    const queries: string[] = [];
    const db = { query: async (sql: string) => { queries.push(sql); return { rows: [{ started_at: new Date() }], rowCount: 0 }; } };
    await reconcileActiveWatchlistMatches(db as never);
    expect(queries[0]).toContain('update public.watchlist_rules wr');
    expect(queries.findIndex(sql => sql.includes('insert into public.watchlist_matches'))).toBeGreaterThan(0);
  });
});
