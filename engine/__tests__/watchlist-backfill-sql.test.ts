import {
  buildCanonicalBackfillSql,
  hasCanonicalBackfillPositiveFilter,
  productClassificationLateralJoinSql,
  productCardMatchLateralJoinSql,
  type CanonicalBackfillRule,
} from '../../web/src/lib/watchlist-backfill-sql';

function rule(overrides: Partial<CanonicalBackfillRule> = {}): CanonicalBackfillRule {
  return {
    id: 20,
    watchlist_id: 10,
    player_id: null,
    brand: null,
    product_line: null,
    season: null,
    card_number: null,
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
    ...overrides,
  };
}

describe('canonical watchlist backfill SQL', () => {
  it('does not backfill rules without a positive filter', () => {
    expect(hasCanonicalBackfillPositiveFilter(rule())).toBe(false);
    expect(buildCanonicalBackfillSql(rule())).toBeNull();
  });

  it('builds backfill from store_products and product_card_matches without listings_feed', () => {
    const built = buildCanonicalBackfillSql(rule({
      include_terms: 'Victor Wembanyama, Wemby',
      brand: 'Panini',
      product_line: 'Prizm',
      season: '2023-24',
      card_number: '136',
      parallel: 'Silver',
      rookie_only: true,
      autograph_only: true,
      serial_numbered_only: true,
      min_price: 10,
      max_price: 250,
    }));

    expect(built).not.toBeNull();
    expect(built?.sql).toContain('from public.store_products sp');
    expect(built?.sql).toContain('public.product_card_matches pcm');
    expect(built?.sql).toContain('public.product_classifications pc');
    expect(built?.sql).toContain("pc.category = 'NBA'");
    expect(built?.sql).toContain('sp.is_active = true');
    expect(built?.sql).toContain('sp.current_availability = true');
    expect(built?.sql).toContain('sp.id');
    expect(built?.sql).toContain('pcm.id');
    expect(built?.sql).toContain('on conflict (watchlist_id, watchlist_rule_id, source, external_id)');
    expect(built?.sql).not.toContain('listings_feed');
  });

  it('supports broad text terms and exclusion terms against product text and match data', () => {
    const built = buildCanonicalBackfillSql(rule({
      include_terms: 'LeBron James',
      exclude_terms: 'break, spot',
      raw_only: true,
    }));

    expect(built?.sql).toContain("coalesce(sp.title, '') ilike $3");
    expect(built?.sql).toContain("coalesce(sp.description, '') ilike $3");
    expect(built?.sql).toContain("coalesce(pc.player_name, '') ilike $3");
    expect(built?.sql).toContain("coalesce(pcm.matched_player_name, '') ilike $3");
    expect(built?.sql).not.toContain('coalesce(pcm.match_reasons::text');
    expect(built?.sql).toContain('not (');
    expect(built?.params).toEqual([10, 20, '%LeBron James%', '%break%', '%spot%', '%graded%', 0.75]);
  });

  it('uses a single best product_card_matches lateral join', () => {
    const joinSql = productCardMatchLateralJoinSql();

    expect(joinSql).toContain('where pcm.store_product_id = sp.id');
    expect(joinSql).toContain('order by pcm.confidence desc');
    expect(joinSql).toContain('limit 1');
  });

  it('uses a single latest deterministic product classification lateral join', () => {
    const joinSql = productClassificationLateralJoinSql();

    expect(joinSql).toContain('where pc.store_product_id = sp.id');
    expect(joinSql).toContain("pc.classifier_type = 'deterministic'");
    expect(joinSql).toContain("pc.classifier_version = 'deterministic-title-v1'");
    expect(joinSql).toContain('limit 1');
  });

  it('treats generic rookie include terms as rookie attributes, not identity terms', () => {
    const built = buildCanonicalBackfillSql(rule({
      include_terms: 'Rookie',
    }));

    expect(built?.sql).toContain("coalesce(pc.is_rookie, coalesce(sp.title, '') ~* '\\m(rc|rookie|rookies)\\M') = true");
    expect(built?.params).toEqual([10, 20, 0.75]);
    expect(built?.sql).not.toContain('%Rookie%');
  });
});
