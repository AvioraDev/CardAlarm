import type { FilterOptions } from "./types";

const INVENTORY_ACTIVE_WHERE = "sp.is_active = true AND sp.current_availability = true";

function addParam(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

export function buildInventoryFilterClause(filters: FilterOptions): {
  conditions: string[];
  params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => addParam(params, value);

  if (filters.source) conditions.push(`sp.source = ${add(filters.source)}`);
  if (filters.year) conditions.push(`sp.title ILIKE ${add(`%${filters.year}%`)}`);
  if (filters.setName) conditions.push(`sp.title ILIKE ${add(`%${filters.setName}%`)}`);
  if (filters.player) {
    const placeholder = add(`%${filters.player}%`);
    conditions.push(`(pcm.matched_player_name = ${add(filters.player)} OR sp.title ILIKE ${placeholder})`);
  }
  if (filters.variant) conditions.push(`sp.title ILIKE ${add(`%${filters.variant}%`)}`);
  if (filters.matchType === "Matched") conditions.push("pcm.id IS NOT NULL");
  else if (filters.matchType === "Cached") conditions.push("pcm.id IS NULL");
  if (filters.isSerial === "1") conditions.push("(coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial')");
  else if (filters.isSerial === "0") conditions.push("not (coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial')");
  if (filters.isAuto === "1") conditions.push("coalesce(sp.title, '') ~* '\\m(auto|autograph)\\M'");
  else if (filters.isAuto === "0") conditions.push("not (coalesce(sp.title, '') ~* '\\m(auto|autograph)\\M')");
  if (filters.isRookie === "1") conditions.push("coalesce(sp.title, '') ~* '\\m(rc|rookie)\\M'");
  else if (filters.isRookie === "0") conditions.push("not (coalesce(sp.title, '') ~* '\\m(rc|rookie)\\M')");
  if (filters.priceMin) {
    const min = Number.parseFloat(filters.priceMin);
    if (!Number.isNaN(min)) conditions.push(`sp.current_price >= ${add(min)}`);
  }
  if (filters.priceMax) {
    const max = Number.parseFloat(filters.priceMax);
    if (!Number.isNaN(max)) conditions.push(`sp.current_price <= ${add(max)}`);
  }
  if (filters.search) {
    const placeholder = add(`%${filters.search}%`);
    conditions.push(`(
      sp.title ILIKE ${placeholder}
      OR sp.description ILIKE ${placeholder}
      OR pcm.matched_player_name ILIKE ${placeholder}
    )`);
  }

  return { conditions, params };
}

export function inventoryListingSelectSql(): string {
  return `sp.id,
       sp.external_product_id as external_id,
       sp.source,
       coalesce(sp.title, 'Untitled listing') as title,
       sp.current_price::float8 as price,
       coalesce(sp.product_url, sp.canonical_url, '') as url,
       coalesce(sp.image_url, '') as image_url,
       case when pcm.id is null then 'Cached' else 'Matched' end as match_type,
       false as is_dismissed,
       (not sp.current_availability or not sp.is_active) as is_oos,
       sp.created_at,
       null::text as year,
       null::text as set_name,
       null::text as card_number,
       pcm.matched_player_name as player_name,
       null::text as variant,
       (coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial') as is_serial,
       null::text as serial_number,
       null::text as serial_current,
       null::text as serial_limit,
       (coalesce(sp.title, '') ~* '\\m(auto|autograph)\\M') as is_auto,
       (coalesce(sp.title, '') ~* '\\m(rc|rookie)\\M') as is_rookie,
       null::text as category,
       pcm.confidence::float8 as match_confidence,
       case
         when pcm.status = 'possible' then 'possible'
         when pcm.id is not null then coalesce(pcm.status, 'confirmed')
         else null
       end as match_status,
       pcm.match_reasons,
       pcm.unmatched_fields,
       pcm.matcher_version`;
}

export function inventoryMatchJoinSql(): string {
  return `left join lateral (
       select *
       from public.product_card_matches pcm
       where pcm.store_product_id = sp.id
       order by pcm.confidence desc, pcm.updated_at desc
       limit 1
     ) pcm on true`;
}

export function buildInventoryWhereSql(filters: FilterOptions): {
  whereSql: string;
  params: unknown[];
} {
  const { conditions, params } = buildInventoryFilterClause(filters);
  return {
    whereSql: [INVENTORY_ACTIVE_WHERE, ...conditions].join(" AND "),
    params,
  };
}
