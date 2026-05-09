import {
  buildInventoryWhereSql,
  buildWatchlistMatchWhereSql,
  inventoryListingSelectSql,
  inventoryMatchJoinSql,
  watchlistInventoryListingSelectSql,
  watchlistInventoryMatchJoinSql,
} from '../../web/src/lib/inventory-sql';

describe('canonical inventory SQL helpers', () => {
  it('builds browse-all SQL from store_products without listings_feed', () => {
    const selectSql = inventoryListingSelectSql();
    const joinSql = inventoryMatchJoinSql();

    expect(selectSql).toContain('sp.external_product_id as external_id');
    expect(joinSql).toContain('public.product_card_matches');
    expect(`${selectSql}\n${joinSql}`).not.toContain('listings_feed');
  });

  it('builds My Matches SQL shape from watchlist_matches and store_products without listings_feed', () => {
    const selectSql = watchlistInventoryListingSelectSql();
    const joinSql = watchlistInventoryMatchJoinSql();

    expect(selectSql).toContain('sp.external_product_id as external_id');
    expect(selectSql).toContain('pcm.matched_player_name');
    expect(selectSql).toContain('p.full_name');
    expect(selectSql).toContain("nullif(trim(split_part(coalesce(wr.include_terms, ''), ',', 1)), '')");
    expect(selectSql).toContain('w.name');
    expect(selectSql).toContain("when wm.status = 'possible' then 'possible'");
    expect(selectSql).toContain('greatest(coalesce(wm.confidence, 0), coalesce(pcm.confidence, 0))');
    expect(joinSql).toContain('public.product_card_matches');
    expect(joinSql).toContain('pcm.id = wm.product_card_match_id');
    expect(`${selectSql}\n${joinSql}`).not.toContain('listings_feed');
  });

  it('builds practical filters against canonical cached inventory fields', () => {
    const { whereSql, params } = buildInventoryWhereSql({
      source: 'TopPlay Sports Cards',
      search: 'Wembanyama',
      priceMin: '10',
      priceMax: '50',
      matchType: 'Matched',
      isSerial: '1',
    });

    expect(whereSql).toContain('sp.is_active = true');
    expect(whereSql).toContain('sp.source = $1');
    expect(whereSql).toContain('sp.current_price >= $2');
    expect(whereSql).toContain('sp.current_price <= $3');
    expect(whereSql).toContain('pcm.id IS NOT NULL');
    expect(whereSql).toContain("coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial'");
    expect(whereSql).toContain('sp.title ILIKE $4');
    expect(params).toEqual(['TopPlay Sports Cards', 10, 50, '%Wembanyama%']);
  });

  it('builds user-scoped My Matches filters without listings_feed', () => {
    const { whereSql, params } = buildWatchlistMatchWhereSql('user-1', {
      watchlistId: '42',
      source: 'TopPlay Sports Cards',
      player: 'Kevin Durant',
      team: 'Suns',
      year: '2023',
      variant: 'Prizm',
      matchStatus: 'possible',
      isRookie: '1',
      isAuto: '0',
      isSerial: '1',
      priceMin: '5',
      priceMax: '100',
      search: 'gold',
    });

    expect(whereSql).toContain('w.user_id = $1');
    expect(whereSql).toContain('w.is_active = true');
    expect(whereSql).toContain('sp.is_active = true');
    expect(whereSql).toContain('sp.current_availability = true');
    expect(whereSql).toContain('w.id = $2');
    expect(whereSql).toContain("wm.status = 'possible' OR pcm.status = 'possible'");
    expect(whereSql).toContain("coalesce(sp.title, '') ~* '\\m(rc|rookie)\\M'");
    expect(whereSql).toContain("not (coalesce(sp.title, '') ~* '\\m(auto|autograph)\\M')");
    expect(whereSql).toContain("coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial'");
    expect(whereSql).toContain('wr.include_terms ILIKE');
    expect(whereSql).not.toContain('listings_feed');
    expect(params).toEqual([
      'user-1',
      42,
      'TopPlay Sports Cards',
      '%2023%',
      '%Suns%',
      '%Prizm%',
      'Kevin Durant',
      '%Kevin Durant%',
      5,
      100,
      '%gold%',
    ]);
  });

  it('ignores unsafe watchlist ids while preserving user scope', () => {
    const { whereSql, params } = buildWatchlistMatchWhereSql('user-1', { watchlistId: '42abc' });

    expect(whereSql).toContain('w.user_id = $1');
    expect(whereSql).not.toContain('w.id = $2');
    expect(params).toEqual(['user-1']);
  });
});
