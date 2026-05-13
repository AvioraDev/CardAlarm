import os from 'node:os';
import { closeDb, getDb, type DbClient } from './db';
import { runIngestionCycle } from './ingest';
import {
  claimNextScanJob,
  completeScanJob,
  failScanJob,
  heartbeatScanJob,
  markScanJobRunProjectionRunning,
  recoverStaleScanJobs,
  recoverStaleStoreScanJobs,
  type ScanJobRow,
} from './scan-jobs';
import { loadScanSources, NO_SCAN_SOURCES_MESSAGE } from './sources';
import type { ScanMode, SourceConfig } from './types';

type WorkerLogger = Pick<Console, 'info' | 'error'>;

type WorkerDeps = {
  workerId?: string;
  heartbeatIntervalMs?: number;
  logger?: WorkerLogger;
  loadSources?: (db: DbClient) => Promise<SourceConfig[]>;
  runCycle?: typeof runIngestionCycle;
};

export type WorkerOnceResult = {
  claimed: boolean;
  succeeded: boolean;
  scanJobId: number | null;
  error?: string;
};

function defaultWorkerId(): string {
  return `scan-worker:${os.hostname()}:${process.pid}`;
}

function jobMode(job: ScanJobRow): ScanMode {
  if (job.mode === 'watchlist' || job.mode === 'full') return job.mode;
  throw new Error(`Unsupported scan job mode: ${job.mode}`);
}

function startHeartbeat(
  db: DbClient,
  jobId: number,
  workerId: string,
  intervalMs: number,
  logger: WorkerLogger
): ReturnType<typeof setInterval> | null {
  if (intervalMs <= 0) return null;
  const interval = setInterval(() => {
    heartbeatScanJob(db, jobId, workerId, { phase: 'running' }).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Scan worker heartbeat failed for job ${jobId}: ${message}`);
    });
  }, intervalMs);
  interval.unref?.();
  return interval;
}

export async function runWorkerOnce(
  db: DbClient,
  deps: WorkerDeps = {}
): Promise<WorkerOnceResult> {
  const workerId = deps.workerId ?? defaultWorkerId();
  const logger = deps.logger ?? console;
  const loadSources = deps.loadSources ?? loadScanSources;
  const runCycle = deps.runCycle ?? runIngestionCycle;
  const heartbeatIntervalMs = deps.heartbeatIntervalMs ?? 10_000;

  await recoverStaleScanJobs(db);
  await recoverStaleStoreScanJobs(db);

  const job = await claimNextScanJob(db, workerId);
  if (!job) {
    logger.info('No queued scan job found. Worker exiting cleanly.');
    return { claimed: false, succeeded: true, scanJobId: null };
  }

  logger.info(`Claimed scan job #${job.id} (${job.mode}).`);
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  try {
    const mode = jobMode(job);
    await markScanJobRunProjectionRunning(db, job.scan_run_id);
    await heartbeatScanJob(db, job.id, workerId, { phase: 'loading_sources' });
    heartbeatInterval = startHeartbeat(db, job.id, workerId, heartbeatIntervalMs, logger);

    const sources = await loadSources(db);
    if (sources.length === 0) throw new Error(NO_SCAN_SOURCES_MESSAGE);

    await heartbeatScanJob(db, job.id, workerId, {
      phase: 'running_scan',
      sourceCount: sources.length,
    });

    const result = await runCycle(db, sources, {
      mode,
      onProgress: async progress => {
        if (job.scan_run_id !== null) {
          await db.query(
            `update public.scan_runs
             set processed = $2,
                 matched = $3
             where id = $1`,
            [job.scan_run_id, progress.processed, progress.matched]
          );
        }
        await heartbeatScanJob(db, job.id, workerId, {
          phase: 'running_scan',
          processed: progress.processed,
          matched: progress.matched,
        });
      },
    });

    await completeScanJob(db, job, workerId, result);
    logger.info(`Scan job #${job.id} completed. Processed: ${result.processed}, matched: ${result.matched}.`);
    return { claimed: true, succeeded: true, scanJobId: job.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failScanJob(db, job, workerId, errorMessage);
    logger.error(`Scan job #${job.id} failed: ${errorMessage}`);
    return { claimed: true, succeeded: false, scanJobId: job.id, error: errorMessage };
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  }
}

async function main(): Promise<void> {
  const db = getDb();
  try {
    const result = await runWorkerOnce(db);
    if (result.claimed && !result.succeeded) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Scan worker crashed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
