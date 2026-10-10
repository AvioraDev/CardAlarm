import { readFileSync } from "fs";
import { join } from "path";
import { buildCanonicalBackfillSql } from "../../web/src/lib/watchlist-backfill-sql";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("profiles role lockdown migration", () => {
  const sql = read("supabase/migrations/20260526000000_profiles_role_lockdown.sql");

  it("removes blanket UPDATE and only re-grants non-privileged columns", () => {
    expect(sql).toContain("revoke update on public.profiles from authenticated");
    expect(sql).toMatch(/grant update \(display_name, updated_at\) on public\.profiles to authenticated/);
    expect(sql).not.toMatch(/grant update \([^)]*role/);
  });

  it("only lets users insert their own profile with the user role", () => {
    expect(sql).toMatch(/with check \(\(select auth\.uid\(\)\) = user_id and role = 'user'\)/);
  });
});

describe("watchlist backfill card number matching", () => {
  const rule = {
    id: 1,
    watchlist_id: 1,
    player_id: null,
    brand: "Panini",
    product_line: null,
    season: null,
    card_number: "24",
    parallel: null,
    rookie_only: false,
    autograph_only: false,
    relic_only: false,
    serial_numbered_only: false,
    graded_only: false,
    raw_only: false,
    min_price: null,
    max_price: null,
    include_terms: null,
    exclude_terms: null,
    minimum_match_confidence: 0.75,
  };

  it("passes the card number as a bound parameter and escapes regex metacharacters", () => {
    const built = buildCanonicalBackfillSql(rule);
    if (!built) throw new Error("expected a backfill query for a rule with a brand filter");
    const { sql, params } = built;
    expect(params).toContain("24");
    expect(sql).toContain("regexp_replace(");
    // Only #n / No. n markers count, never bare digits (seasons such as 2023-24, serials such as /24).
    expect(sql).not.toContain("(^|[^0-9])");
  });
});
