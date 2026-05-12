import fs from 'node:fs';
import path from 'node:path';
import {
  buildInventoryWhereSql,
  buildWatchlistMatchWhereSql,
  inventoryClassificationJoinSql,
  inventoryListingSelectSql,
  inventoryMatchJoinSql,
  watchlistInventoryListingSelectSql,
  watchlistInventoryMatchJoinSql,
} from '../../web/src/lib/inventory-sql';

describe('canonical inventory SQL helpers', () => {
  it('builds browse-all SQL from store_products without listings_feed', () => {
    const selectSql = inventoryListingSelectSql();
    const joinSql = inventoryMatchJoinSql();
    const classificationJoinSql = inventoryClassificationJoinSql();

    expect(selectSql).toContain('sp.external_product_id as external_id');
    expect(selectSql).toContain('coalesce(pcm.matched_player_name, pc.player_name) as player_name');
    expect(selectSql).toContain('coalesce(pc.set_name, pc.product_line) as set_name');
    expect(selectSql).toContain('coalesce(pc.variant_name, pc.parallel_name, pc.insert_name) as variant');
    expect(joinSql).toContain('public.product_card_matches');
    expect(classificationJoinSql).toContain('public.product_classifications');
    expect(`${selectSql}\n${joinSql}\n${classificationJoinSql}`).not.toContain('listings_feed');
  });

  it('builds My Matches SQL shape from watchlist_matches and store_products without listings_feed', () => {
    const selectSql = watchlistInventoryListingSelectSql();
    const joinSql = watchlistInventoryMatchJoinSql();

    expect(selectSql).toContain('sp.external_product_id as external_id');
    expect(selectSql).toContain('pcm.matched_player_name');
    expect(selectSql).toContain('p.full_name');
    expect(selectSql).toContain("nullif(trim(split_part(coalesce(wr.include_terms, ''), ',', 1)), '')");
    expect(selectSql).toContain('w.name');
    expect(selectSql).toContain('pc.player_name');
    expect(selectSql).toContain('pc.card_number');
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
    expect(whereSql).toContain('coalesce(pc.is_serial');
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
    expect(whereSql).toContain('coalesce(pc.is_rookie');
    expect(whereSql).toContain('coalesce(pc.is_auto');
    expect(whereSql).toContain('coalesce(pc.is_serial');
    expect(whereSql).toContain('pc.player_name');
    expect(whereSql).toContain('wr.include_terms ILIKE');
    expect(whereSql).not.toContain('listings_feed');
    expect(params).toEqual([
      'user-1',
      42,
      'TopPlay Sports Cards',
      '2023',
      '%2023%',
      '%Suns%',
      'Prizm',
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

  it('builds facets from product_classifications while preserving product_card_matches', () => {
    const queriesSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'src', 'lib', 'queries.ts'), 'utf8');

    expect(queriesSource).toContain('getFacet("pc.year")');
    expect(queriesSource).toContain('getFacet("coalesce(pc.set_name, pc.product_line)")');
    expect(queriesSource).toContain('getFacet("coalesce(pcm.matched_player_name, pc.player_name)")');
    expect(queriesSource).toContain('getFacet("coalesce(pc.variant_name, pc.parallel_name, pc.insert_name)")');
    expect(queriesSource).toContain('getFacet("pc.category")');
    expect(queriesSource).toContain('inventoryClassificationJoinSql()');
    expect(queriesSource).toContain(') facets');
    expect(queriesSource).toContain('order by lower(value) asc, value asc');
    expect(queriesSource).not.toContain('ORDER BY count DESC');
  });

  it('builds user watchlist-scoped facets from watchlist matches', () => {
    const queriesSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'src', 'lib', 'queries.ts'), 'utf8');
    const functionStart = queriesSource.indexOf('export async function getUserWatchlistFilterFacets');
    const functionEnd = queriesSource.indexOf('export async function getStores');
    const functionSource = queriesSource.slice(functionStart, functionEnd);

    expect(functionSource).toContain('buildWatchlistMatchWhereSql(userId, filters)');
    expect(functionSource).not.toContain('buildInventoryWhereSql');
    expect(functionSource).toContain('from public.watchlist_matches wm');
    expect(functionSource).toContain('join public.watchlists w on w.id = wm.watchlist_id');
    expect(functionSource).toContain('left join public.watchlist_rules wr on wr.id = wm.watchlist_rule_id');
    expect(functionSource).toContain('left join public.players p on p.id = wr.player_id');
    expect(functionSource).toContain('join public.store_products sp on sp.id = wm.store_product_id');
    expect(functionSource).toContain('watchlistInventoryMatchJoinSql()');
    expect(functionSource).toContain('inventoryClassificationJoinSql()');
    expect(functionSource).toContain('count(distinct store_product_id)::int as count');
    expect(functionSource).toContain("getFacet(\"coalesce(pcm.matched_player_name, pc.player_name, p.full_name, nullif(trim(split_part(coalesce(wr.include_terms, ''), ',', 1)), ''), w.name)\")");
    expect(functionSource).toContain('order by lower(value) asc, value asc');
  });
});
