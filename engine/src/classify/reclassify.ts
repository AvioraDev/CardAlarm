import fs from 'node:fs';
import path from 'node:path';
import { closeDb, getDb, type DbClient } from '../db';
import { runWithConcurrency } from '../ingest';
import { loadCatalogueIndex } from './catalogue-index';
import { classifyListing, JEV_CLASSIFIER_TYPE, JEV_CLASSIFIER_VERSION, type ListingClassification } from './classifier';
import { buildListingEvidence, evidenceHash } from './evidence';
import { createJevClient } from './jev-client';
import { saveClassifications, type ClassificationRecord, type ListingRow } from './store';

/**
 * One-off, scoped reclassification with the v2 classifier (CAR-77 follow-up, approved by Harry on 2026-10-12).
 *
 * Unlike the scan worker it never takes "every listing without a current-version row": it classifies exactly the
 * Jev rows of the previous version, in two stages, and stops itself on an error rate or cost overrun.
 *
 *   stage 1  Jev v1 rows that were linked to a product and lost the link when the catalogue was re-imported
 *   stage 2  every other Jev v1 row
 *   missing  every live listing (as the readers see it) with no row for the current version, from any store
 *
 * Usage:
 *   npx tsx --env-file=web/.env.local engine/src/classify/reclassify.ts --stage 1|2|all [options]
 *
 *   --sample N            classify N listings spread across the stages and write nothing (timing and cost)
 *   --live-only           only listings currently available
 *   --limit N             cap the number of listings (default: all)
 *   --estimate-usd X      the cost estimate; the run stops when spend exceeds it by more than 20%
 *   --max-error-rate R    stop when failures / attempts exceeds R after 100 attempts (default 0.02)
 *   --concurrency N       default 6
 *   --out FILE            where to write the run summary (JSON)
 *
 * Cost: TypeSafe bills $0.042 per million INPUT tokens and nothing for output.
 */

const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
const SAVE_BATCH = 200;
const MIN_ATTEMPTS_FOR_ERROR_RATE = 100;

type Stage = '1' | '2' | 'all' | 'missing';

function optionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/** Store-product ids to classify. Jev v1 rows only, and none that already have a current-version row (resumable). */
async function selectIds(db: DbClient, stage: Stage, liveOnly: boolean, limit: number | null, sample: number | null): Promise<number[]> {
  if (stage === 'missing') {
    const missing = await db.query<{ store_product_id: string }>(
      `select sp.id::text as store_product_id
       from public.store_products sp
       where sp.is_active and sp.current_availability
         and not exists (select 1 from public.product_classifications cur where cur.store_product_id = sp.id and cur.classifier_type = $1 and cur.classifier_version = $2)
       order by case when $3::boolean then md5(sp.id::text) else lpad(sp.id::text, 12, '0') end
       ${limit !== null || sample !== null ? 'limit ' + Number(sample ?? limit) : ''}`,
      [JEV_CLASSIFIER_TYPE, JEV_CLASSIFIER_VERSION, sample !== null]
    );
    return missing.rows.map(row => Number(row.store_product_id));
  }
  const result = await db.query<{ store_product_id: string }>(
    `select pc.store_product_id
     from public.product_classifications pc
     join public.store_products sp on sp.id = pc.store_product_id
     where pc.classifier_type = $1
       and pc.classifier_version = 'jev-catalogue-v1'
       and ($2::text = 'all'
            or ($2::text = '1' and pc.product_line is not null and pc.checklist_product_id is null)
            or ($2::text = '2' and not (pc.product_line is not null and pc.checklist_product_id is null)))
       and (not $3::boolean or sp.current_availability = true)
       and not exists (
         select 1 from public.product_classifications cur
         where cur.store_product_id = pc.store_product_id and cur.classifier_type = $1 and cur.classifier_version = $4
       )
     order by case when $5::boolean then md5(pc.store_product_id::text) else lpad(pc.store_product_id::text, 12, '0') end
     ${limit !== null || sample !== null ? 'limit ' + Number(sample ?? limit) : ''}`,
    [JEV_CLASSIFIER_TYPE, stage, liveOnly, JEV_CLASSIFIER_VERSION, sample !== null]
  );
  return result.rows.map(row => Number(row.store_product_id));
}

async function loadRows(db: DbClient, ids: number[]): Promise<ListingRow[]> {
  const result = await db.query<ListingRow & { id: string }>(
    `select sp.id, sp.source, sp.title, sp.description, sp.raw_latest_payload, null::text as evidence_hash
     from public.store_products sp where sp.id = any($1::bigint[]) order by sp.id`,
    [ids]
  );
  return result.rows.map(row => ({ ...row, id: Number(row.id) }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sampleArg = optionValue(args, '--sample');
  const sample = sampleArg ? Number(sampleArg) : null;
  const stage = (optionValue(args, '--stage') ?? 'all') as Stage;
  if (!['1', '2', 'all', 'missing'].includes(stage)) throw new Error('--stage must be 1, 2, all or missing');
  const liveOnly = args.includes('--live-only');
  const limitArg = optionValue(args, '--limit');
  const limit = limitArg ? Number(limitArg) : null;
  const estimateUsd = Number(optionValue(args, '--estimate-usd') ?? NaN);
  const maxErrorRate = Number(optionValue(args, '--max-error-rate') ?? 0.02);
  const concurrency = Math.min(16, Math.max(1, Number(optionValue(args, '--concurrency') ?? 6)));
  const outFile = optionValue(args, '--out');
  const dryRun = sample !== null || args.includes('--dry-run');

  if (!dryRun && !Number.isFinite(estimateUsd)) throw new Error('--estimate-usd is required when writing, so the cost limit can be enforced');

  const db = getDb();
  try {
    const ids = await selectIds(db, stage, liveOnly, limit, sample);
    const listings = await loadRows(db, ids);
    const catalogue = await loadCatalogueIndex(db);
    const jev = createJevClient();
    console.log(`Stage ${stage}${liveOnly ? ' (live only)' : ''}: ${listings.length} listings${dryRun ? ' (nothing will be written)' : ''}.`);

    const status = new Map<string, number>();
    const records: ClassificationRecord[] = [];
    let attempts = 0;
    let failures = 0;
    let inputTokens = 0;
    let requests = 0;
    let saved = 0;
    let stopReason: string | null = null;
    const started = Date.now();
    let saving: Promise<unknown> = Promise.resolve();

    const flush = (force = false): void => {
      if (dryRun || (!force && records.length < SAVE_BATCH)) return;
      const batch = records.splice(0, records.length);
      if (batch.length > 0) saving = saving.then(async () => { saved += await saveClassifications(db, batch); });
    };
    const spend = (): number => inputTokens * USD_PER_INPUT_TOKEN;

    await runWithConcurrency(listings, concurrency, async listing => {
      if (stopReason) return;
      let classification: ListingClassification;
      attempts++;
      try {
        classification = await classifyListing(buildListingEvidence(listing), catalogue, jev);
      } catch (error) {
        failures++;
        if (failures <= 5) console.error(`  x #${listing.id}: ${error instanceof Error ? error.message : String(error)}`);
        if (attempts >= MIN_ATTEMPTS_FOR_ERROR_RATE && failures / attempts > maxErrorRate) {
          stopReason = `error rate ${((failures / attempts) * 100).toFixed(1)}% over the ${(maxErrorRate * 100).toFixed(0)}% limit after ${attempts} attempts`;
        }
        return;
      }
      inputTokens += classification.inputTokens;
      requests += classification.jevRequests;
      status.set(classification.reviewStatus, (status.get(classification.reviewStatus) ?? 0) + 1);
      records.push({
        storeProductId: listing.id,
        evidenceHash: evidenceHash(buildListingEvidence(listing), JEV_CLASSIFIER_VERSION),
        title: listing.title,
        classification,
      });
      flush();
      if (Number.isFinite(estimateUsd) && spend() > estimateUsd * 1.2) {
        stopReason = `cost $${spend().toFixed(3)} is more than 20% over the $${estimateUsd.toFixed(3)} estimate`;
      }
    });
    flush(true);
    await saving;

    const seconds = (Date.now() - started) / 1000;
    const summary = {
      stage,
      liveOnly,
      dryRun,
      selected: listings.length,
      attempts,
      classified: attempts - failures,
      failures,
      errorRate: attempts === 0 ? 0 : failures / attempts,
      requests,
      inputTokens,
      costUsd: spend(),
      seconds,
      listingsPerSecond: attempts / Math.max(seconds, 0.001),
      saved,
      stoppedEarly: stopReason,
      status: Object.fromEntries(status),
      classifierVersion: JEV_CLASSIFIER_VERSION,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (outFile) {
      fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
      fs.writeFileSync(path.resolve(outFile), JSON.stringify(summary, null, 2) + '\n', 'utf8');
    }
    if (stopReason) {
      console.error(`STOPPED: ${stopReason}`);
      process.exitCode = 2;
    }
  } finally {
    await closeDb();
  }
}

main().catch(error => {
  console.error('Reclassification failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
