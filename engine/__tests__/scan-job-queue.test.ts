import fs from 'node:fs';
import path from 'node:path';

function readRootFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', ...segments), 'utf8');
}

function readWebFile(...segments: string[]): string {
  return readRootFile('web', 'src', ...segments);
}

describe('CAR-28 DB-backed scan job queue', () => {
  const migration = readRootFile('supabase', 'migrations', '20260513008000_scan_job_queue.sql');
  const engineHelpers = readRootFile('engine', 'src', 'scan-jobs.ts');
  const webActions = readWebFile('lib', 'actions.ts');
  const webScanJobs = readWebFile('lib', 'scan-jobs.ts');
  const scanPanel = readWebFile('app', 'components', 'scan-panel.tsx');
  const ingest = readRootFile('engine', 'src', 'ingest.ts');

  it('adds scan_jobs and store_scan_jobs without adding page_fetch_tasks', () => {
    expect(migration).toContain('create table if not exists public.scan_jobs');
    expect(migration).toContain('create table if not exists public.store_scan_jobs');
    expect(migration).toContain("status text not null default 'queued'");
    expect(migration).toContain('scan_run_id bigint references public.scan_runs');
    expect(migration).toContain('store_scan_run_id bigint references public.store_scan_runs');
    expect(migration).not.toContain('create table if not exists public.page_fetch_tasks');
  });

  it('adds claim, heartbeat, stale recovery, and cancellation helpers', () => {
    expect(engineHelpers).toContain('export async function claimNextScanJob');
    expect(engineHelpers).toContain('export async function claimNextStoreScanJob');
    expect(engineHelpers).toContain('for update skip locked');
    expect(engineHelpers).toContain("set status = 'running'");
    expect(engineHelpers).toContain('heartbeat_at = now()');
    expect(engineHelpers).toContain('export async function recoverStaleScanJobs');
    expect(engineHelpers).toContain('export async function recoverStaleStoreScanJobs');
    expect(engineHelpers).toContain('requestScanJobCancellation');
  });

  it('changes admin scans to enqueue jobs instead of spawning detached processes', () => {
    expect(webActions).toContain('await enqueueScanJob(mode, admin.user_id)');
    expect(webActions).toContain('hasActiveScanJob()');
    expect(webActions).not.toContain('spawn(');
    expect(webActions).not.toContain('child.unref()');
    expect(webActions).not.toContain('engine/src/scan.ts');
    expect(webScanJobs).toContain("insert into public.scan_runs (mode, status)");
    expect(webScanJobs).toContain("values ($1, 'queued')");
    expect(webScanJobs).toContain('insert into public.scan_jobs');
  });

  it('keeps admin scan UI compatible with queued/running scan_runs', () => {
    expect(scanPanel).toContain('scanRun?.status === "queued" || scanRun?.status === "running"');
    expect(scanPanel).toContain('scanRun.status === "queued" ? "Queued" : "Scanning"');
    expect(webScanJobs).toContain("from public.scan_runs");
    expect(webScanJobs).toContain("where status in ('queued', 'running')");
  });

  it('preserves existing OOS safety guard for incomplete scans', () => {
    expect(ingest).toContain('if (!hadFetchError && !stoppedEarlyFromCache) {');
    expect(ingest).toContain('markedOOS = await markMissingSourceProductsOOS');
  });
});
