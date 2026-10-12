import { closeDb, getDb, type DbClient } from '../db';
import { JEV_CLASSIFIER_TYPE, JEV_CLASSIFIER_VERSION } from './classifier';

/**
 * Reports how many live listings have no row for the current classifier version. A reader that reads this version
 * cannot see such a listing, so it must be zero before readers read it.
 *
 * Usage: npx tsx --env-file=web/.env.local engine/src/classify/coverage-check.ts [--list N]
 * Exit code 1 when any live listing is missing a row.
 */

/** Live = available, active, from an active store. $1 type, $2 version. */
export function missingCurrentVersionSql(listLimit = 0): string {
  const base = `from public.store_products sp
     join public.stores s on s.id = sp.store_id and s.is_active
     where sp.is_active and sp.current_availability
       and not exists (
         select 1 from public.product_classifications pc
         where pc.store_product_id = sp.id and pc.classifier_type = $1 and pc.classifier_version = $2
       )`;
  return listLimit > 0 ? `select sp.id::text id, sp.title ${base} order by sp.id limit ${Math.trunc(listLimit)}` : `select count(*)::int as missing ${base}`;
}

export interface Coverage {
  live: number;
  missing: number;
  version: string;
}

export async function checkCoverage(db: DbClient): Promise<Coverage> {
  const live = await db.query<{ live: number }>(
    `select count(*)::int as live from public.store_products sp join public.stores s on s.id = sp.store_id and s.is_active where sp.is_active and sp.current_availability`
  );
  const missing = await db.query<{ missing: number }>(missingCurrentVersionSql(), [JEV_CLASSIFIER_TYPE, JEV_CLASSIFIER_VERSION]);
  return { live: live.rows[0]!.live, missing: missing.rows[0]!.missing, version: JEV_CLASSIFIER_VERSION };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const listIndex = args.indexOf('--list');
  const db = getDb();
  try {
    const coverage = await checkCoverage(db);
    console.log(`Classifier ${coverage.version}: ${coverage.live} live listings, ${coverage.missing} without a current-version row.`);
    if (coverage.missing > 0 && listIndex !== -1) {
      const rows = await db.query<{ id: string; title: string }>(missingCurrentVersionSql(Number(args[listIndex + 1] ?? 20)), [JEV_CLASSIFIER_TYPE, JEV_CLASSIFIER_VERSION]);
      for (const row of rows.rows) console.log(`  #${row.id} ${row.title}`);
    }
    if (coverage.missing > 0) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
