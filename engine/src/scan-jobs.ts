import type { DbClient } from './db';
import type { ScanMode } from './types';

export type ScanJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';

export type ScanJobRow = {
  id: number;
  scan_run_id: number | null;
  mode: ScanMode | 'shallow';
  status: ScanJobStatus;
  locked_by: string | null;
  attempts: number;
  max_attempts: number;
  metadata: Record<string, unknown>;
};

export type StoreScanJobRow = {
  id: number;
  scan_job_id: number;
  store_scan_run_id: number | null;
  store_id: number | null;
  store_slug: string;
  status: ScanJobStatus;
  locked_by: string | null;
  attempts: number;
  max_attempts: number;
  metadata: Record<string, unknown>;
};

export async function markScanJobRunProjectionRunning(
  db: DbClient,
  scanRunId: number | null,
): Promise<number> {
  if (scanRunId === null) return 0;
  const result = await db.query(
    `update public.scan_runs
     set status = 'running',
         error = null
     where id = $1`,
    [scanRunId]
  );
  return result.rowCount ?? 0;
}

export async function claimNextScanJob(db: DbClient, workerId: string): Promise<ScanJobRow | null> {
  const result = await db.query<ScanJobRow>(
    `with next_job as (
       select id
       from public.scan_jobs
       where status = 'queued'
         and next_attempt_at <= now()
       order by priority asc, created_at asc
       limit 1
       for update skip locked
     )
     update public.scan_jobs sj
     set status = 'running',
         locked_by = $1,
         locked_at = now(),
         heartbeat_at = now(),
         started_at = coalesce(started_at, now()),
         attempts = attempts + 1,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('claimedAt', now())
     from next_job
     where sj.id = next_job.id
     returning sj.id, sj.scan_run_id, sj.mode, sj.status, sj.locked_by, sj.attempts, sj.max_attempts, sj.metadata`,
    [workerId]
  );
  return result.rows[0] ?? null;
}

export async function claimNextStoreScanJob(db: DbClient, workerId: string): Promise<StoreScanJobRow | null> {
  const result = await db.query<StoreScanJobRow>(
    `with next_job as (
       select id
       from public.store_scan_jobs
       where status = 'queued'
         and next_attempt_at <= now()
       order by created_at asc
       limit 1
       for update skip locked
     )
     update public.store_scan_jobs ssj
     set status = 'running',
         locked_by = $1,
         locked_at = now(),
         heartbeat_at = now(),
         started_at = coalesce(started_at, now()),
         attempts = attempts + 1,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('claimedAt', now())
     from next_job
     where ssj.id = next_job.id
     returning
       ssj.id,
       ssj.scan_job_id,
       ssj.store_scan_run_id,
       ssj.store_id,
       ssj.store_slug,
       ssj.status,
       ssj.locked_by,
       ssj.attempts,
       ssj.max_attempts,
       ssj.metadata`,
    [workerId]
  );
  return result.rows[0] ?? null;
}

export async function completeScanJob(
  db: DbClient,
  job: Pick<ScanJobRow, 'id' | 'scan_run_id'>,
  workerId: string,
  result: { processed: number; matched: number }
): Promise<void> {
  await db.query(
    `update public.scan_jobs
     set status = 'completed',
         processed = $3,
         matched = $4,
         error = null,
         completed_at = now(),
         heartbeat_at = now(),
         locked_by = null,
         locked_at = null,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('completedAt', now())
     where id = $1
       and locked_by = $2
       and status = 'running'`,
    [job.id, workerId, result.processed, result.matched]
  );

  if (job.scan_run_id !== null) {
    await db.query(
      `update public.scan_runs
       set status = 'completed',
           processed = $2,
           matched = $3,
           error = null,
           completed_at = now()
       where id = $1`,
      [job.scan_run_id, result.processed, result.matched]
    );
  }
}

export async function failScanJob(
  db: DbClient,
  job: Pick<ScanJobRow, 'id' | 'scan_run_id'>,
  workerId: string,
  errorMessage: string
): Promise<void> {
  await db.query(
    `update public.scan_jobs
     set status = 'failed',
         error = $3,
         completed_at = now(),
         heartbeat_at = now(),
         locked_by = null,
         locked_at = null,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('failedAt', now())
     where id = $1
       and locked_by = $2
       and status = 'running'`,
    [job.id, workerId, errorMessage]
  );

  if (job.scan_run_id !== null) {
    await db.query(
      `update public.scan_runs
       set status = 'failed',
           error = $2,
           completed_at = now()
       where id = $1`,
      [job.scan_run_id, errorMessage]
    );
  }
}

export async function heartbeatScanJob(
  db: DbClient,
  scanJobId: number,
  workerId: string,
  metadata: Record<string, unknown> = {}
): Promise<number> {
  const result = await db.query(
    `update public.scan_jobs
     set heartbeat_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || $3::jsonb
     where id = $1
       and locked_by = $2
       and status = 'running'`,
    [scanJobId, workerId, JSON.stringify(metadata)]
  );
  return result.rowCount ?? 0;
}

export async function heartbeatStoreScanJob(
  db: DbClient,
  storeScanJobId: number,
  workerId: string,
  metadata: Record<string, unknown> = {}
): Promise<number> {
  const result = await db.query(
    `update public.store_scan_jobs
     set heartbeat_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || $3::jsonb
     where id = $1
       and locked_by = $2
       and status = 'running'`,
    [storeScanJobId, workerId, JSON.stringify(metadata)]
  );
  return result.rowCount ?? 0;
}

export async function recoverStaleScanJobs(db: DbClient, staleMinutes = 10): Promise<number> {
  const result = await db.query(
    `update public.scan_jobs
     set status = case when attempts < max_attempts then 'queued' else 'timed_out' end,
         locked_by = null,
         locked_at = null,
         heartbeat_at = null,
         next_attempt_at = case when attempts < max_attempts then now() + interval '1 minute' else next_attempt_at end,
         completed_at = case when attempts < max_attempts then completed_at else now() end,
         error = case
           when attempts < max_attempts then error
           else coalesce(error, 'Timed out: scan worker heartbeat expired')
         end,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('staleRecoveredAt', now())
     where status = 'running'
       and coalesce(heartbeat_at, locked_at, started_at, created_at) < now() - make_interval(mins => $1::int)`,
    [staleMinutes]
  );
  return result.rowCount ?? 0;
}

export async function recoverStaleStoreScanJobs(db: DbClient, staleMinutes = 10): Promise<number> {
  const result = await db.query(
    `update public.store_scan_jobs
     set status = case when attempts < max_attempts then 'queued' else 'timed_out' end,
         locked_by = null,
         locked_at = null,
         heartbeat_at = null,
         next_attempt_at = case when attempts < max_attempts then now() + interval '1 minute' else next_attempt_at end,
         completed_at = case when attempts < max_attempts then completed_at else now() end,
         error_message = case
           when attempts < max_attempts then error_message
           else coalesce(error_message, 'Timed out: store scan worker heartbeat expired')
         end,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('staleRecoveredAt', now())
     where status = 'running'
       and coalesce(heartbeat_at, locked_at, started_at, created_at) < now() - make_interval(mins => $1::int)`,
    [staleMinutes]
  );
  return result.rowCount ?? 0;
}

export async function requestScanJobCancellation(
  db: DbClient,
  scanJobId: number,
  userId: string | null
): Promise<number> {
  const result = await db.query(
    `update public.scan_jobs
     set cancel_requested_at = now(),
         cancel_requested_by = $2,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelRequestedAt', now())
     where id = $1
       and status in ('queued', 'running')`,
    [scanJobId, userId]
  );
  return result.rowCount ?? 0;
}
