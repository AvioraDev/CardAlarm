import { closeDb, getDb } from './db';
import { liveListingSql } from './live-listing';

/**
 * Tells "nothing in stock" from "scans are not running" (CAR-96). Per store: whether it is active, when it last scanned
 * successfully and how overdue that is against its own scan frequency, and how many listings are live for customers.
 * With --player "Name" it also counts that player's listings per store: those live for customers, and those still
 * flagged available but not live (stale).
 *
 * Usage: npx tsx --env-file=web/.env.local engine/src/scan-health.ts [--player "Dylan Harper"]...
 * Exit code 1 when an active store has not scanned successfully within twice its frequency.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const players = args.flatMap((arg, index) => (arg === '--player' && args[index + 1] ? [args[index + 1]!] : []));
  const db = getDb();
  try {
    const stores = await db.query<{ slug: string; is_active: boolean; frequency: number; last_ok: Date | null; hours_since: number | null; allowed_hours: number; flagged_live: number; live: number }>(
      `select s.slug, s.is_active, coalesce(s.scan_frequency_minutes, 1440) frequency, s.last_successful_scan_at last_ok,
              round(extract(epoch from (now() - s.last_successful_scan_at)) / 3600, 1)::float8 hours_since,
              (2 * coalesce(s.scan_frequency_minutes, 1440) / 60.0)::float8 allowed_hours,
              (select count(*) from public.store_products sp where sp.store_id = s.id and sp.is_active and sp.current_availability)::int flagged_live,
              (select count(*) from public.store_products sp where sp.store_id = s.id and ${liveListingSql('sp')})::int live
       from public.stores s order by s.is_active desc, s.slug`
    );
    let overdue = false;
    console.log('store            active  last successful scan (UTC)    hours ago  allowed  flagged live  live for customers');
    for (const s of stores.rows) {
      const late = s.is_active && (s.hours_since === null || s.hours_since > s.allowed_hours);
      overdue = overdue || late;
      console.log(
        `${s.slug.padEnd(16)} ${String(s.is_active).padEnd(7)} ${(s.last_ok ? s.last_ok.toISOString() : 'never').padEnd(29)} ${String(s.hours_since ?? '-').padStart(9)}  ${String(s.allowed_hours).padStart(7)}  ${String(s.flagged_live).padStart(12)}  ${String(s.live).padStart(18)}${late ? '  <-- OVERDUE' : ''}`
      );
    }
    for (const player of players) {
      const rows = await db.query<{ slug: string; is_active: boolean; live: number; stale: number }>(
        `select s.slug, s.is_active,
                count(*) filter (where ${liveListingSql('sp')})::int live,
                count(*) filter (where sp.is_active and sp.current_availability and not ${liveListingSql('sp')})::int stale
         from public.store_products sp join public.stores s on s.id = sp.store_id
         where sp.title ilike $1 group by 1, 2 order by 1`,
        [`%${player}%`]
      );
      console.log(`\n"${player}" listings by store:`);
      for (const row of rows.rows) console.log(`  ${row.slug.padEnd(14)} ${row.is_active ? 'active  ' : 'inactive'} live ${row.live}, flagged available but stale ${row.stale}`);
      if (rows.rows.length === 0) console.log('  none in any store');
    }
    if (overdue) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
