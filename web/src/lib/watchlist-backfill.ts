import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "./db";
import { buildCanonicalBackfillSql, type CanonicalBackfillRule } from "./watchlist-backfill-sql";

type BackfillRule = CanonicalBackfillRule;

type BackfillResult = {
  watchlistId: number;
  rulesProcessed: number;
  matchesCreatedOrUpdated: number;
};

async function rulesForWatchlist(client: PoolClient, userId: string, watchlistId: number): Promise<BackfillRule[]> {
  const result = await client.query<BackfillRule>(
    `select wr.*
     from public.watchlist_rules wr
     join public.watchlists w on w.id = wr.watchlist_id
     where w.id = $1
       and w.user_id = $2
       and w.is_active = true
     order by wr.created_at asc`,
    [watchlistId, userId],
  );

  return result.rows;
}

async function backfillRule(client: PoolClient, rule: BackfillRule): Promise<number> {
  const backfillSql = buildCanonicalBackfillSql(rule);
  if (!backfillSql) return 0;

  const result = await client.query(backfillSql.sql, backfillSql.params);

  return result.rowCount ?? 0;
}

export async function backfillWatchlist(userId: string, watchlistId: number): Promise<BackfillResult> {
  return transaction(async (client) => {
    const rules = await rulesForWatchlist(client, userId, watchlistId);
    await client.query(
      `delete from public.watchlist_matches wm
       using public.watchlists w
       where wm.watchlist_id = w.id
         and w.id = $1
         and w.user_id = $2`,
      [watchlistId, userId],
    );

    let matchesCreatedOrUpdated = 0;
    for (const rule of rules) {
      matchesCreatedOrUpdated += await backfillRule(client, rule);
    }

    return {
      watchlistId,
      rulesProcessed: rules.length,
      matchesCreatedOrUpdated,
    };
  });
}
