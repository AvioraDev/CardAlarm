import "server-only";
import { createClient } from "./supabase/server";
import type { UserWatchlistRow, UserWatchlistRuleRow } from "./types";

type WatchlistRowWithoutRules = Omit<UserWatchlistRow, "rules">;

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRule(row: UserWatchlistRuleRow): UserWatchlistRuleRow {
  return {
    ...row,
    min_price: numericValue(row.min_price),
    max_price: numericValue(row.max_price),
    minimum_match_confidence: numericValue(row.minimum_match_confidence) ?? 0.75,
  };
}

export async function getUserWatchlists(userId: string): Promise<UserWatchlistRow[]> {
  const supabase = await createClient();
  const { data: watchlists, error: watchlistsError } = await supabase
    .from("watchlists")
    .select("id, user_id, name, is_active, notification_enabled, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .returns<WatchlistRowWithoutRules[]>();

  if (watchlistsError) throw new Error(watchlistsError.message);
  if (!watchlists || watchlists.length === 0) return [];

  const watchlistIds = watchlists.map((watchlist) => watchlist.id);
  const { data: rules, error: rulesError } = await supabase
    .from("watchlist_rules")
    .select(
      `id, watchlist_id, intent_type, player_id, team_id, brand, product_line, season, set_id,
       catalogue_card_id, catalogue_variant_id, card_number, parallel, rookie_only, autograph_only, relic_only,
       serial_numbered_only, graded_only, raw_only, min_price, max_price,
       currency, include_terms, exclude_terms, minimum_match_confidence,
       created_at, updated_at`,
    )
    .in("watchlist_id", watchlistIds)
    .order("created_at", { ascending: true })
    .returns<UserWatchlistRuleRow[]>();

  if (rulesError) throw new Error(rulesError.message);

  const rulesByWatchlist = new Map<number, UserWatchlistRuleRow[]>();
  for (const rule of rules ?? []) {
    const existing = rulesByWatchlist.get(rule.watchlist_id) ?? [];
    existing.push(normalizeRule(rule));
    rulesByWatchlist.set(rule.watchlist_id, existing);
  }

  const { data: matchCounts, error: matchCountsError } = await supabase
    .from("watchlist_matches")
    .select("watchlist_id")
    .in("watchlist_id", watchlistIds)
    .returns<Array<{ watchlist_id: number }>>();

  if (matchCountsError) throw new Error(matchCountsError.message);

  const matchCountByWatchlist = new Map<number, number>();
  for (const match of matchCounts ?? []) {
    matchCountByWatchlist.set(match.watchlist_id, (matchCountByWatchlist.get(match.watchlist_id) ?? 0) + 1);
  }

  return watchlists.map((watchlist) => ({
    ...watchlist,
    rules: rulesByWatchlist.get(watchlist.id) ?? [],
    match_count: matchCountByWatchlist.get(watchlist.id) ?? 0,
  }));
}

export async function getUserWatchlist(userId: string, watchlistId: number): Promise<UserWatchlistRow | null> {
  const watchlists = await getUserWatchlists(userId);
  return watchlists.find((watchlist) => watchlist.id === watchlistId) ?? null;
}
