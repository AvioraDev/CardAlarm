import "server-only";
import type { PoolClient } from "pg";
import { execute, query, transaction } from "./db";
import type { ScanMode, ScanRunRow } from "./types";

type EnqueuedScanJob = {
  scanJobId: number;
  scanRun: ScanRunRow;
};

async function expireStaleRunningScanJobs(): Promise<void> {
  await execute(
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
       and coalesce(heartbeat_at, locked_at, started_at, created_at) < now() - interval '10 minutes'`,
  );
  await execute(
    `update public.scan_runs
     set status = 'failed',
         error = coalesce(error, 'Timed out: stale running scan cleared before enqueue'),
         completed_at = now()
     where status = 'running'
       and started_at < now() - interval '30 minutes'`,
  );
}

export async function hasActiveScanJob(): Promise<boolean> {
  await expireStaleRunningScanJobs();
  const rows = await query<{ id: number }>(
    `select id
     from (
       select id, created_at
       from public.scan_jobs
       where status in ('queued', 'running')
       union all
       select id, started_at as created_at
       from public.scan_runs
       where status in ('queued', 'running')
     ) active_scans
     order by created_at desc
     limit 1`,
  );
  return Boolean(rows[0]);
}

async function insertQueuedScanRun(client: PoolClient, mode: ScanMode): Promise<ScanRunRow> {
  const result = await client.query<ScanRunRow>(
    `insert into public.scan_runs (mode, status)
     values ($1, 'queued')
     returning id, mode, status, processed, matched, error, started_at, completed_at`,
    [mode],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create scan run projection.");
  return row;
}

export async function enqueueScanJob(mode: ScanMode, requestedBy: string): Promise<EnqueuedScanJob> {
  return transaction(async (client) => {
    const scanRun = await insertQueuedScanRun(client, mode);
    const jobResult = await client.query<{ id: number }>(
      `insert into public.scan_jobs (
         scan_run_id,
         mode,
         status,
         requested_by,
         requested_by_kind,
         metadata
       )
       values (
         $1,
         $2,
         'queued',
         $3,
         'admin',
         jsonb_build_object('source', 'admin_scan_action')
       )
       returning id`,
      [scanRun.id, mode, requestedBy],
    );
    const job = jobResult.rows[0];
    if (!job) throw new Error("Failed to enqueue scan job.");
    return { scanJobId: job.id, scanRun };
  });
}
