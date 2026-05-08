import {
  buildInventoryWhereSql,
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
});
