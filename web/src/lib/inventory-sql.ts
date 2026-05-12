import type { FilterOptions } from "./types";

const INVENTORY_ACTIVE_WHERE = "sp.is_active = true AND sp.current_availability = true";
const WATCHLIST_MATCH_ACTIVE_WHERE = `
  w.user_id = $1
  AND w.is_active = true
  AND sp.is_active = true
  AND sp.current_availability = true`;
const CLASSIFIER_VERSION = "deterministic-title-v1";
const TITLE_SERIAL_SIGNAL = "coalesce(sp.title, '') ~* '\\m(\\d{1,4}\\s*/\\s*\\d{1,5}|#?/\\s*\\d{1,5})\\M'";
const TITLE_AUTO_SIGNAL = "coalesce(sp.title, '') ~* '\\m(auto|autograph)\\M'";
const TITLE_ROOKIE_SIGNAL = "coalesce(sp.title, '') ~* '\\m(rc|rookie)\\M'";

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
  if (filters.year) {
    const exact = add(filters.year);
    const like = add(`%${filters.year}%`);
    conditions.push(`(pc.year = ${exact} OR (pc.year IS NULL AND sp.title ILIKE ${like}))`);
  }
  if (filters.setName) {
    const exact = add(filters.setName);
    const like = add(`%${filters.setName}%`);
    conditions.push(`(
      coalesce(pc.set_name, pc.product_line) = ${exact}
      OR (coalesce(pc.set_name, pc.product_line) IS NULL AND sp.title ILIKE ${like})
    )`);
  }
  if (filters.player) {
    const exact = add(filters.player);
    const like = add(`%${filters.player}%`);
    conditions.push(`(
      pcm.matched_player_name = ${exact}
      OR pc.player_name = ${exact}
      OR (pcm.matched_player_name IS NULL AND pc.player_name IS NULL AND sp.title ILIKE ${like})
    )`);
  }
  if (filters.variant) {
    const exact = add(filters.variant);
    const like = add(`%${filters.variant}%`);
    conditions.push(`(
      coalesce(pc.variant_name, pc.parallel_name, pc.insert_name) = ${exact}
      OR (coalesce(pc.variant_name, pc.parallel_name, pc.insert_name) IS NULL AND sp.title ILIKE ${like})
    )`);
  }
  if (filters.category) {
    const exact = add(filters.category);
    const like = add(`%${filters.category}%`);
    conditions.push(`(pc.category = ${exact} OR (pc.category IS NULL AND sp.title ILIKE ${like}))`);
  }
  if (filters.matchType === "Matched") conditions.push("pcm.id IS NOT NULL");
  else if (filters.matchType === "Cached") conditions.push("pcm.id IS NULL");
  if (filters.isSerial === "1") conditions.push(`coalesce(pc.is_serial, coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial', ${TITLE_SERIAL_SIGNAL}) = true`);
  else if (filters.isSerial === "0") conditions.push(`coalesce(pc.is_serial, coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial', ${TITLE_SERIAL_SIGNAL}) = false`);
  if (filters.isAuto === "1") conditions.push(`coalesce(pc.is_auto, ${TITLE_AUTO_SIGNAL}) = true`);
  else if (filters.isAuto === "0") conditions.push(`coalesce(pc.is_auto, ${TITLE_AUTO_SIGNAL}) = false`);
  if (filters.isRookie === "1") conditions.push(`coalesce(pc.is_rookie, ${TITLE_ROOKIE_SIGNAL}) = true`);
  else if (filters.isRookie === "0") conditions.push(`coalesce(pc.is_rookie, ${TITLE_ROOKIE_SIGNAL}) = false`);
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
      OR pc.player_name ILIKE ${placeholder}
      OR coalesce(pc.set_name, pc.product_line) ILIKE ${placeholder}
      OR coalesce(pc.variant_name, pc.parallel_name, pc.insert_name) ILIKE ${placeholder}
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
       false as is_saved,
       false as is_dismissed_for_user,
       false as is_not_match_for_user,
       (not sp.current_availability or not sp.is_active) as is_oos,
       sp.created_at,
       pc.year,
       coalesce(pc.set_name, pc.product_line) as set_name,
       pc.card_number,
       coalesce(pcm.matched_player_name, pc.player_name) as player_name,
       coalesce(pc.variant_name, pc.parallel_name, pc.insert_name) as variant,
       coalesce(pc.is_serial, coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial', false) as is_serial,
       pc.serial_number,
       pc.serial_current,
       pc.serial_limit,
       coalesce(pc.is_auto, false) as is_auto,
       coalesce(pc.is_rookie, false) as is_rookie,
       pc.category,
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

export function watchlistInventoryListingSelectSql(): string {
  return `sp.id,
       sp.external_product_id as external_id,
       sp.source,
       coalesce(sp.title, 'Untitled listing') as title,
       sp.current_price::float8 as price,
       coalesce(sp.product_url, sp.canonical_url, '') as url,
       coalesce(sp.image_url, '') as image_url,
       case when pcm.id is null then 'Cached' else 'Matched' end as match_type,
       false as is_dismissed,
       coalesce(ufs.is_saved, false) as is_saved,
       coalesce(ufs.is_dismissed, false) as is_dismissed_for_user,
       coalesce(ufs.is_not_match, false) as is_not_match_for_user,
       (not sp.current_availability or not sp.is_active) as is_oos,
       sp.created_at,
       pc.year,
       coalesce(pc.set_name, pc.product_line) as set_name,
       pc.card_number,
       coalesce(
         pcm.matched_player_name,
         p.full_name,
         nullif(trim(split_part(coalesce(wr.include_terms, ''), ',', 1)), ''),
         w.name,
         pc.player_name
       ) as player_name,
       coalesce(pc.variant_name, pc.parallel_name, pc.insert_name) as variant,
       coalesce(pc.is_serial, coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial', false) as is_serial,
       pc.serial_number,
       pc.serial_current,
       pc.serial_limit,
       coalesce(pc.is_auto, false) as is_auto,
       coalesce(pc.is_rookie, false) as is_rookie,
       pc.category,
       greatest(coalesce(wm.confidence, 0), coalesce(pcm.confidence, 0))::float8 as match_confidence,
       case
         when wm.status = 'possible' then 'possible'
         when pcm.status = 'possible' then 'possible'
         when wm.status is not null then wm.status
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

export function inventoryClassificationJoinSql(): string {
  return `left join lateral (
       select *
       from public.product_classifications pc
       where pc.store_product_id = sp.id
         and pc.classifier_type = 'deterministic'
       order by (pc.classifier_version = '${CLASSIFIER_VERSION}') desc, pc.updated_at desc
       limit 1
     ) pc on true`;
}

export function watchlistInventoryMatchJoinSql(): string {
  return `left join lateral (
       select *
       from public.product_card_matches pcm
       where pcm.id = wm.product_card_match_id
          or (wm.product_card_match_id is null and pcm.store_product_id = sp.id)
       order by (pcm.id = wm.product_card_match_id) desc, pcm.confidence desc, pcm.updated_at desc
       limit 1
     ) pcm on true`;
}

export function userFeedbackStateJoinSql(): string {
  return `left join lateral (
       select
         coalesce(
           (
             array_agg(mf.feedback_type order by mf.created_at desc, mf.id desc)
             filter (where mf.feedback_type in ('save', 'unsave'))
           )[1] = 'save',
           false
         ) as is_saved,
         coalesce(
           (
             array_agg(mf.feedback_type order by mf.created_at desc, mf.id desc)
             filter (where mf.feedback_type in ('dismiss', 'undo_dismiss'))
           )[1] = 'dismiss',
           false
         ) as is_dismissed,
         coalesce(
           (
             array_agg(mf.feedback_type order by mf.created_at desc, mf.id desc)
             filter (where mf.feedback_type = 'not_match')
           )[1] = 'not_match',
           false
         ) as is_not_match
       from public.match_feedback mf
       where mf.user_id = $1
         and mf.store_product_id = sp.id
     ) ufs on true`;
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

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && String(parsed) === value ? parsed : null;
}

export function buildWatchlistMatchWhereSql(
  userId: string,
  filters: FilterOptions = {}
): {
  whereSql: string;
  params: unknown[];
} {
  const conditions: string[] = [WATCHLIST_MATCH_ACTIVE_WHERE];
  const params: unknown[] = [userId];
  const add = (value: unknown): string => addParam(params, value);
  const watchlistId = parsePositiveInteger(filters.watchlistId);

  if (watchlistId) conditions.push(`w.id = ${add(watchlistId)}`);
  if (filters.source) conditions.push(`sp.source = ${add(filters.source)}`);
  if (filters.year) {
    const exact = add(filters.year);
    const like = add(`%${filters.year}%`);
    conditions.push(`(pc.year = ${exact} OR (pc.year IS NULL AND sp.title ILIKE ${like}))`);
  }
  if (filters.team) {
    const like = add(`%${filters.team}%`);
    conditions.push(`(pc.team_name ILIKE ${like} OR (pc.team_name IS NULL AND sp.title ILIKE ${like}))`);
  }
  if (filters.setName) {
    const exact = add(filters.setName);
    const like = add(`%${filters.setName}%`);
    conditions.push(`(
      coalesce(pc.set_name, pc.product_line) = ${exact}
      OR (coalesce(pc.set_name, pc.product_line) IS NULL AND sp.title ILIKE ${like})
    )`);
  }
  if (filters.variant) {
    const exact = add(filters.variant);
    const like = add(`%${filters.variant}%`);
    conditions.push(`(
      coalesce(pc.variant_name, pc.parallel_name, pc.insert_name) = ${exact}
      OR (coalesce(pc.variant_name, pc.parallel_name, pc.insert_name) IS NULL AND sp.title ILIKE ${like})
    )`);
  }
  if (filters.player) {
    const exactPlayer = add(filters.player);
    const likePlayer = add(`%${filters.player}%`);
    conditions.push(`(
      pcm.matched_player_name = ${exactPlayer}
      OR pc.player_name = ${exactPlayer}
      OR p.full_name ILIKE ${likePlayer}
      OR wr.include_terms ILIKE ${likePlayer}
      OR w.name ILIKE ${likePlayer}
      OR (pcm.matched_player_name IS NULL AND pc.player_name IS NULL AND sp.title ILIKE ${likePlayer})
    )`);
  }
  if (filters.category) {
    const exact = add(filters.category);
    const like = add(`%${filters.category}%`);
    conditions.push(`(pc.category = ${exact} OR (pc.category IS NULL AND sp.title ILIKE ${like}))`);
  }
  if (filters.matchStatus === "confirmed") {
    conditions.push("(coalesce(wm.status, pcm.status, 'confirmed') != 'possible')");
  } else if (filters.matchStatus === "possible") {
    conditions.push("(wm.status = 'possible' OR pcm.status = 'possible')");
  }
  if (filters.isSerial === "1") conditions.push(`coalesce(pc.is_serial, coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial', ${TITLE_SERIAL_SIGNAL}) = true`);
  else if (filters.isSerial === "0") conditions.push(`coalesce(pc.is_serial, coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial', ${TITLE_SERIAL_SIGNAL}) = false`);
  if (filters.isAuto === "1") conditions.push(`coalesce(pc.is_auto, ${TITLE_AUTO_SIGNAL}) = true`);
  else if (filters.isAuto === "0") conditions.push(`coalesce(pc.is_auto, ${TITLE_AUTO_SIGNAL}) = false`);
  if (filters.isRookie === "1") conditions.push(`coalesce(pc.is_rookie, ${TITLE_ROOKIE_SIGNAL}) = true`);
  else if (filters.isRookie === "0") conditions.push(`coalesce(pc.is_rookie, ${TITLE_ROOKIE_SIGNAL}) = false`);
  if (filters.priceMin) {
    const min = Number.parseFloat(filters.priceMin);
    if (!Number.isNaN(min)) conditions.push(`sp.current_price >= ${add(min)}`);
  }
  if (filters.priceMax) {
    const max = Number.parseFloat(filters.priceMax);
    if (!Number.isNaN(max)) conditions.push(`sp.current_price <= ${add(max)}`);
  }
  if (filters.search) {
    const search = add(`%${filters.search}%`);
    conditions.push(`(
      sp.title ILIKE ${search}
      OR sp.description ILIKE ${search}
      OR pcm.matched_player_name ILIKE ${search}
      OR pc.player_name ILIKE ${search}
      OR coalesce(pc.set_name, pc.product_line) ILIKE ${search}
      OR coalesce(pc.variant_name, pc.parallel_name, pc.insert_name) ILIKE ${search}
      OR w.name ILIKE ${search}
      OR wr.include_terms ILIKE ${search}
    )`);
  }

  return {
    whereSql: conditions.join(" AND "),
    params,
  };
}
