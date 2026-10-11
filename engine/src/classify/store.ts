import type { DbClient } from '../db';
import { JEV_CLASSIFIER_TYPE, JEV_CLASSIFIER_VERSION, type ListingClassification } from './classifier';
import type { ListingEvidenceSource } from './evidence';

export interface ListingRow extends ListingEvidenceSource {
  id: number;
  evidence_hash: string | null;
}

export interface ListingQuery {
  limit: number;
  store?: string;
  /** Deterministic pseudo-random order, so a sample is spread across the catalogue rather than the newest rows. */
  sample?: boolean;
  /** Include listings that already have a classification for the current classifier version. */
  includeClassified?: boolean;
  /** Only basketball singles whose product was not in the catalogue. For use after importing more checklists. */
  missingProductOnly?: boolean;
}

/** Available listings from active stores, with the evidence hash of any existing Jev classification. */
export async function loadListings(db: DbClient, query: ListingQuery): Promise<ListingRow[]> {
  const result = await db.query<ListingRow & { id: string }>(
    `select
       sp.id,
       sp.source,
       sp.title,
       sp.description,
       sp.raw_latest_payload,
       pc.evidence_hash
     from public.store_products sp
     join public.stores s on s.id = sp.store_id and s.is_active = true
     left join public.product_classifications pc
       on pc.store_product_id = sp.id
      and pc.classifier_type = $1
      and pc.classifier_version = $2
     where sp.current_availability = true
       and ($3::text is null or sp.source = $3)
       and ($4::boolean or pc.id is null)
       and (
         not $7::boolean
         or (pc.item_type = 'single_card' and pc.sport = 'basketball' and pc.checklist_product_id is null)
       )
     order by case when $5::boolean then md5(sp.id::text) else lpad(sp.id::text, 12, '0') end
     limit $6`,
    [
      JEV_CLASSIFIER_TYPE,
      JEV_CLASSIFIER_VERSION,
      query.store ?? null,
      query.includeClassified ?? false,
      query.sample ?? false,
      query.limit,
      query.missingProductOnly ?? false,
    ]
  );
  return result.rows.map(row => ({ ...row, id: Number(row.id) }));
}

/**
 * Listings that need classifying: never classified by the current version, or whose content changed since.
 * A product snapshot is only written when a listing's content changes, so it marks the ones worth rechecking.
 */
export async function loadPendingListings(db: DbClient, limit: number): Promise<ListingRow[]> {
  const result = await db.query<ListingRow & { id: string }>(
    `select
       sp.id,
       sp.source,
       sp.title,
       sp.description,
       sp.raw_latest_payload,
       pc.evidence_hash
     from public.store_products sp
     join public.stores s on s.id = sp.store_id and s.is_active = true
     left join public.product_classifications pc
       on pc.store_product_id = sp.id
      and pc.classifier_type = $1
      and pc.classifier_version = $2
     where sp.current_availability = true
       and (
         pc.id is null
         or exists (
           select 1
           from public.product_snapshots ps
           where ps.store_product_id = sp.id
             and ps.observed_at > pc.updated_at
         )
       )
     order by sp.id
     limit $3`,
    [JEV_CLASSIFIER_TYPE, JEV_CLASSIFIER_VERSION, limit]
  );
  return result.rows.map(row => ({ ...row, id: Number(row.id) }));
}

/** Records that these listings were rechecked and their classification still stands. */
export async function markClassificationsChecked(db: DbClient, storeProductIds: number[]): Promise<void> {
  if (storeProductIds.length === 0) return;
  await db.query(
    `update public.product_classifications
     set updated_at = now()
     where classifier_type = $1
       and classifier_version = $2
       and store_product_id = any($3::bigint[])`,
    [JEV_CLASSIFIER_TYPE, JEV_CLASSIFIER_VERSION, storeProductIds]
  );
}

export interface ClassificationRecord {
  storeProductId: number;
  evidenceHash: string;
  title: string;
  classification: ListingClassification;
}

function toRow(record: ClassificationRecord): Record<string, unknown> {
  const c = record.classification;
  const isBasketballSingle = c.itemType === 'single_card' && c.sport === 'basketball';
  const serialLimit = c.fields.serialLimit ?? c.parallel?.serialLimit ?? null;

  return {
    store_product_id: record.storeProductId,
    classifier_version: JEV_CLASSIFIER_VERSION,
    classifier_type: JEV_CLASSIFIER_TYPE,
    status: 'classified',
    item_type: c.itemType,
    sport: c.sport,
    year: isBasketballSingle ? c.fields.season : null,
    // Kept for the readers that still filter on category; basketball singles are what they mean by 'NBA'.
    category: isBasketballSingle ? 'NBA' : null,
    brand: c.product?.brand ?? null,
    product_line: c.product?.productLine ?? null,
    set_name: c.subset?.name ?? null,
    card_number: isBasketballSingle ? c.fields.cardNumber : null,
    player_name: c.playerName,
    player_id: c.playerId,
    variant_name: c.parallel?.name ?? null,
    parallel_name: c.parallel?.name ?? null,
    insert_name: c.subset?.kind === 'insert' ? c.subset.name : null,
    is_rookie: isBasketballSingle && c.isRookie,
    is_auto: isBasketballSingle && c.isAutograph,
    is_serial: isBasketballSingle && serialLimit !== null,
    serial_number:
      c.fields.serialCurrent !== null && c.fields.serialLimit !== null
        ? `${c.fields.serialCurrent}/${c.fields.serialLimit}`
        : serialLimit === null
          ? null
          : String(serialLimit),
    serial_current: c.fields.serialCurrent === null ? null : String(c.fields.serialCurrent),
    serial_limit: serialLimit === null ? null : String(serialLimit),
    grader: c.fields.grader,
    grade: c.fields.grade,
    checklist_product_id: c.product?.id ?? null,
    checklist_subset_id: c.subset?.id ?? null,
    checklist_card_id: c.card?.id ?? null,
    checklist_parallel_id: c.parallel?.id ?? null,
    confidence: Number(c.confidence.toFixed(4)),
    evidence_hash: record.evidenceHash,
    review_status: c.reviewStatus,
    review_reasons: c.reviewReasons,
    raw_signals: {
      title: record.title,
      jevModel: c.jevModel,
      jevRequests: c.jevRequests,
      inputTokens: c.inputTokens,
      itemTypeConfidence: c.itemTypeConfidence,
      sportConfidence: c.sportConfidence,
      playerConfidence: c.playerConfidence,
      playerSource: c.playerSource,
      productConfidence: c.productConfidence,
      subsetConfidence: c.subsetConfidence,
      parallelConfidence: c.parallelConfidence,
      parallelStatus: c.parallelStatus,
      isRelic: c.isRelic,
    },
  };
}

export async function saveClassifications(db: DbClient, records: ClassificationRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  const result = await db.query(
    `with input as (
       select *
       from jsonb_to_recordset($1::jsonb) as x(
         store_product_id bigint, classifier_version text, classifier_type text, status text,
         item_type text, sport text, year text, category text, brand text, product_line text, set_name text,
         card_number text, player_name text, player_id bigint, variant_name text, parallel_name text,
         insert_name text, is_rookie boolean, is_auto boolean, is_serial boolean, serial_number text,
         serial_current text, serial_limit text, grader text, grade text,
         checklist_product_id bigint, checklist_subset_id bigint, checklist_card_id bigint,
         checklist_parallel_id bigint, confidence numeric, evidence_hash text, review_status text,
         review_reasons jsonb, raw_signals jsonb
       )
     )
     insert into public.product_classifications (
       store_product_id, classifier_version, classifier_type, status,
       item_type, sport, year, category, brand, product_line, set_name,
       card_number, player_name, player_id, variant_name, parallel_name,
       insert_name, is_rookie, is_auto, is_serial, serial_number,
       serial_current, serial_limit, grader, grade,
       checklist_product_id, checklist_subset_id, checklist_card_id,
       checklist_parallel_id, confidence, evidence_hash, review_status,
       review_reasons, raw_signals, updated_at
     )
     select
       store_product_id, classifier_version, classifier_type, status,
       item_type, sport, year, category, brand, product_line, set_name,
       card_number, player_name, player_id, variant_name, parallel_name,
       insert_name, is_rookie, is_auto, is_serial, serial_number,
       serial_current, serial_limit, grader, grade,
       checklist_product_id, checklist_subset_id, checklist_card_id,
       checklist_parallel_id, confidence, evidence_hash, review_status,
       review_reasons, raw_signals, now()
     from input
     on conflict (store_product_id, classifier_version, classifier_type) do update set
       status = excluded.status,
       item_type = excluded.item_type,
       sport = excluded.sport,
       year = excluded.year,
       category = excluded.category,
       brand = excluded.brand,
       product_line = excluded.product_line,
       set_name = excluded.set_name,
       card_number = excluded.card_number,
       player_name = excluded.player_name,
       player_id = excluded.player_id,
       variant_name = excluded.variant_name,
       parallel_name = excluded.parallel_name,
       insert_name = excluded.insert_name,
       is_rookie = excluded.is_rookie,
       is_auto = excluded.is_auto,
       is_serial = excluded.is_serial,
       serial_number = excluded.serial_number,
       serial_current = excluded.serial_current,
       serial_limit = excluded.serial_limit,
       grader = excluded.grader,
       grade = excluded.grade,
       checklist_product_id = excluded.checklist_product_id,
       checklist_subset_id = excluded.checklist_subset_id,
       checklist_card_id = excluded.checklist_card_id,
       checklist_parallel_id = excluded.checklist_parallel_id,
       confidence = excluded.confidence,
       evidence_hash = excluded.evidence_hash,
       review_status = excluded.review_status,
       review_reasons = excluded.review_reasons,
       raw_signals = excluded.raw_signals,
       updated_at = now()`,
    [JSON.stringify(records.map(toRow))]
  );
  return result.rowCount ?? 0;
}

export { toRow as classificationRow };
