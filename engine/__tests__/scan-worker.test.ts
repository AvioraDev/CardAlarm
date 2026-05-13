import fs from 'node:fs';
import path from 'node:path';
import { runWorkerOnce } from '../src/worker';
import type { ScanJobRow } from '../src/scan-jobs';
import type { SourceConfig } from '../src/types';

type QueryCall = {
  sql: string;
  params: unknown[];
};

class FakeDb {
  readonly calls: QueryCall[] = [];

  constructor(private readonly claimedJob: ScanJobRow | null) {}

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    this.calls.push({ sql, params });
    if (sql.includes('update public.scan_jobs sj')) {
      return { rows: this.claimedJob ? [this.claimedJob] : [], rowCount: this.claimedJob ? 1 : 0 };
    }
    return { rows: [], rowCount: 1 };
  }
}

const source: SourceConfig = {
  slug: 'topplay',
  name: 'TopPlay Sports Cards',
  baseUrl: 'https://example.com',
  sourceType: 'shopify',
  countryCode: 'NZ',
  currency: 'NZD',
  scanStrategy: 'incremental',
  earlyStopEnabled: true,
  earlyStopUnchangedPages: 2,
};

function scanJob(overrides: Partial<ScanJobRow> = {}): ScanJobRow {
  return {
    id: 42,
    scan_run_id: 7,
    mode: 'full',
    status: 'running',
    locked_by: 'worker-1',
    attempts: 1,
    max_attempts: 3,
    metadata: {},
    ...overrides,
  };
}

function readWebFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'src', ...segments), 'utf8');
}

describe('DB-backed scan worker', () => {
  it('recovers stale jobs before claiming and exits cleanly when no queued job exists', async () => {
    const db = new FakeDb(null);
    const logger = { info: jest.fn(), error: jest.fn() };

    const result = await runWorkerOnce(db as never, {
      workerId: 'worker-1',
      heartbeatIntervalMs: 0,
      logger,
    });

    expect(result).toEqual({ claimed: false, succeeded: true, scanJobId: null });
    expect(db.calls[0]!.sql).toContain('update public.scan_jobs');
    expect(db.calls[1]!.sql).toContain('update public.store_scan_jobs');
    expect(db.calls[2]!.sql).toContain('update public.scan_jobs sj');
    expect(logger.info).toHaveBeenCalledWith('No queued scan job found. Worker exiting cleanly.');
  });

  it('claims one queued job, moves scan_runs to running, and completes both projections', async () => {
    const db = new FakeDb(scanJob());
    const runCycle = jest.fn(async (_db, _sources, options) => {
      await options.onProgress?.({ processed: 3, matched: 1 });
      return { processed: 5, matched: 2 };
    });

    const result = await runWorkerOnce(db as never, {
      workerId: 'worker-1',
      heartbeatIntervalMs: 0,
      logger: { info: jest.fn(), error: jest.fn() },
      loadSources: async () => [source],
      runCycle,
    });

    expect(result).toEqual({ claimed: true, succeeded: true, scanJobId: 42 });
    expect(runCycle).toHaveBeenCalledTimes(1);
    expect(db.calls.filter(call => call.sql.includes('update public.scan_jobs sj'))).toHaveLength(1);
    expect(db.calls.some(call => call.sql.includes("set status = 'running'") && call.sql.includes('public.scan_runs'))).toBe(true);
    expect(db.calls.some(call => call.sql.includes("set status = 'completed'") && call.sql.includes('public.scan_jobs'))).toBe(true);
    expect(db.calls.some(call => call.sql.includes("set status = 'completed'") && call.sql.includes('public.scan_runs'))).toBe(true);
  });

  it('marks scan_jobs and scan_runs failed when existing scan internals fail', async () => {
    const db = new FakeDb(scanJob());

    const result = await runWorkerOnce(db as never, {
      workerId: 'worker-1',
      heartbeatIntervalMs: 0,
      logger: { info: jest.fn(), error: jest.fn() },
      loadSources: async () => [source],
      runCycle: async () => {
        throw new Error('store failed');
      },
    });

    expect(result).toEqual({ claimed: true, succeeded: false, scanJobId: 42, error: 'store failed' });
    expect(db.calls.some(call => call.sql.includes("set status = 'failed'") && call.sql.includes('public.scan_jobs'))).toBe(true);
    expect(db.calls.some(call => call.sql.includes("set status = 'failed'") && call.sql.includes('public.scan_runs'))).toBe(true);
    expect(db.calls.some(call => call.params.includes('store failed'))).toBe(true);
  });

  it('keeps the web admin action enqueue-only', () => {
    const actions = readWebFile('lib', 'actions.ts');

    expect(actions).toContain('await enqueueScanJob(mode, admin.user_id)');
    expect(actions).not.toContain('spawn(');
    expect(actions).not.toContain('child.unref()');
    expect(actions).not.toContain('engine/src/scan.ts');
  });
});
