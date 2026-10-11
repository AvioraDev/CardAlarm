import type { DbClient } from './db';
import type { ScanMode } from './types';

export type ScanScheduleConfig = {
  /** Minutes between incremental scans. 0 disables scheduled incremental scans. */
  incrementalMinutes: number;
  /** Hours between full walks, the only scans allowed to mark products unavailable. 0 disables them. */
  fullHours: number;
};

function parseInterval(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

export function scanScheduleConfig(env: NodeJS.ProcessEnv = process.env): ScanScheduleConfig {
  return {
    incrementalMinutes: parseInterval(env.CARDALARM_SCHEDULE_INCREMENTAL_MINUTES, 60),
    fullHours: parseInterval(env.CARDALARM_SCHEDULE_FULL_HOURS, 24),
  };
}

/**
 * Enqueues one scheduled scan job when no scan is queued or running and no job of a covering mode
 * was created inside the interval. Failed jobs count too, so a broken scan waits out its interval
 * instead of being re-enqueued on every worker poll.
 */
async function enqueueScheduledScanIfDue(
  db: DbClient,
  mode: ScanMode,
  coveringModes: ScanMode[],
  intervalMinutes: number
): Promise<number | null> {
  if (intervalMinutes <= 0) return null;

  const result = await db.query<{ id: number }>(
    `with lock as (
       select pg_advisory_xact_lock(hashtext('cardalarm:scan_schedule'))
     ),
     due as (
       select 1
       from lock
       where not exists (
           select 1 from public.scan_jobs where status in ('queued', 'running')
         )
         and not exists (
           select 1
           from public.scan_jobs
           where mode = any($2::text[])
             and created_at > now() - make_interval(mins => $3::int)
         )
     ),
     scan_run as (
       insert into public.scan_runs (mode, status)
       select $1, 'queued'
       from due
       returning id
     )
     insert into public.scan_jobs (scan_run_id, mode, status, requested_by_kind, metadata)
     select id, $1, 'queued', 'schedule', jsonb_build_object('source', 'scheduler')
     from scan_run
     returning id`,
    [mode, coveringModes, intervalMinutes]
  );

  const row = result.rows[0];
  return row ? Number(row.id) : null;
}

/**
 * Called by the worker loop before each claim. A full walk also covers the incremental interval,
 * so at most one job is enqueued per call.
 */
export async function enqueueDueScheduledScans(
  db: DbClient,
  config: ScanScheduleConfig = scanScheduleConfig()
): Promise<{ mode: ScanMode; scanJobId: number } | null> {
  const fullJobId = await enqueueScheduledScanIfDue(db, 'full', ['full'], config.fullHours * 60);
  if (fullJobId !== null) return { mode: 'full', scanJobId: fullJobId };

  const incrementalJobId = await enqueueScheduledScanIfDue(
    db,
    'watchlist',
    ['watchlist', 'full'],
    config.incrementalMinutes
  );
  if (incrementalJobId !== null) return { mode: 'watchlist', scanJobId: incrementalJobId };

  return null;
}
