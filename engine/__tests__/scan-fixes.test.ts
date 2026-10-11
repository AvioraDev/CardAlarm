import {
  exceedsOosMissingRatio,
  isRetryableStatus,
  oosMaxMissingRatio,
  retryDelayMs,
  sourceForScanMode,
} from '../src/ingest';
import { enqueueDueScheduledScans, scanScheduleConfig } from '../src/scheduler';
import { completeScanJob } from '../src/scan-jobs';
import type { SourceConfig } from '../src/types';

type QueryCall = { sql: string; params: unknown[] };

class FakeDb {
  readonly calls: QueryCall[] = [];

  constructor(private readonly insertedIds: Array<number | null> = []) {}

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    this.calls.push({ sql, params });
    const id = this.insertedIds.shift() ?? null;
    return { rows: id === null ? [] : [{ id }], rowCount: id === null ? 0 : 1 };
  }
}

function source(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    slug: 'topplay',
    name: 'TopPlay',
    baseUrl: 'https://example.com',
    sourceType: 'shopify',
    countryCode: 'NZ',
    currency: 'NZD',
    scanStrategy: 'incremental',
    earlyStopEnabled: true,
    earlyStopUnchangedPages: 2,
    ...overrides,
  };
}

describe('full scan mode', () => {
  it('walks every store to the end of its feed regardless of the store strategy', () => {
    expect(sourceForScanMode(source(), 'full')).toMatchObject({
      scanStrategy: 'full',
      earlyStopEnabled: false,
    });
  });

  it('leaves the store strategy alone for incremental scan jobs', () => {
    const incremental = source();
    expect(sourceForScanMode(incremental, 'watchlist')).toBe(incremental);
  });
});

describe('out-of-stock missing-ratio guard', () => {
  it('allows marking when a plausible share of products is missing', () => {
    expect(exceedsOosMissingRatio({ available: 1000, missing: 300 }, 0.6)).toBe(false);
  });

  it('refuses to mark when most of a store is missing from a complete walk', () => {
    expect(exceedsOosMissingRatio({ available: 1000, missing: 700 }, 0.6)).toBe(true);
  });

  it('does not guard very small stores, where one sale is a large share', () => {
    expect(exceedsOosMissingRatio({ available: 5, missing: 5 }, 0.6)).toBe(false);
  });

  it('falls back to the default ratio for invalid configuration', () => {
    expect(oosMaxMissingRatio('0.4')).toBe(0.4);
    expect(oosMaxMissingRatio('0')).toBe(0.6);
    expect(oosMaxMissingRatio('2')).toBe(0.6);
    expect(oosMaxMissingRatio('nope')).toBe(0.6);
  });
});

describe('page fetch retries', () => {
  it('retries rate limits, timeouts and server errors but not other client errors', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
  });

  it('backs off exponentially and caps the wait', () => {
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(2)).toBe(4000);
    expect(retryDelayMs(10)).toBe(30000);
  });

  it('honours a Retry-After header in seconds, capped', () => {
    expect(retryDelayMs(1, '7')).toBe(7000);
    expect(retryDelayMs(1, '600')).toBe(30000);
    expect(retryDelayMs(2, 'Wed, 21 Oct 2026 07:28:00 GMT')).toBe(4000);
  });
});

describe('scheduled scans', () => {
  it('reads intervals from the environment and lets 0 disable a schedule', () => {
    expect(scanScheduleConfig({})).toEqual({ incrementalMinutes: 60, fullHours: 24 });
    expect(
      scanScheduleConfig({
        CARDALARM_SCHEDULE_INCREMENTAL_MINUTES: '15',
        CARDALARM_SCHEDULE_FULL_HOURS: '0',
      })
    ).toEqual({ incrementalMinutes: 15, fullHours: 0 });
    expect(scanScheduleConfig({ CARDALARM_SCHEDULE_INCREMENTAL_MINUTES: '-5' }).incrementalMinutes).toBe(60);
  });

  it('enqueues a full walk first when one is due and stops there', async () => {
    const db = new FakeDb([11]);

    const result = await enqueueDueScheduledScans(db as never, { incrementalMinutes: 60, fullHours: 24 });

    expect(result).toEqual({ mode: 'full', scanJobId: 11 });
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]!.params).toEqual(['full', ['full'], 1440]);
  });

  it('falls back to an incremental scan, which a recent full walk also covers', async () => {
    const db = new FakeDb([null, 12]);

    const result = await enqueueDueScheduledScans(db as never, { incrementalMinutes: 60, fullHours: 24 });

    expect(result).toEqual({ mode: 'watchlist', scanJobId: 12 });
    expect(db.calls[1]!.params).toEqual(['watchlist', ['watchlist', 'full'], 60]);
  });

  it('enqueues nothing when no schedule is due or schedules are disabled', async () => {
    const idle = new FakeDb([null, null]);
    expect(await enqueueDueScheduledScans(idle as never, { incrementalMinutes: 60, fullHours: 24 })).toBeNull();

    const disabled = new FakeDb([99]);
    expect(await enqueueDueScheduledScans(disabled as never, { incrementalMinutes: 0, fullHours: 0 })).toBeNull();
    expect(disabled.calls).toHaveLength(0);
  });

  it('only enqueues under a lock, when no scan is active, as a schedule-owned job with a scan_runs projection', async () => {
    const db = new FakeDb([11]);
    await enqueueDueScheduledScans(db as never, { incrementalMinutes: 60, fullHours: 24 });
    const sql = db.calls[0]!.sql;

    expect(sql).toContain("pg_advisory_xact_lock(hashtext('cardalarm:scan_schedule'))");
    expect(sql).toContain("status in ('queued', 'running')");
    expect(sql).toContain('insert into public.scan_runs');
    expect(sql).toContain("'schedule'");
  });
});

describe('scan job completion with failed stores', () => {
  it('completes the job and records which stores failed', async () => {
    const db = new FakeDb();

    await completeScanJob(db as never, { id: 42, scan_run_id: null }, 'worker-1', {
      processed: 10,
      matched: 2,
      completedStores: 4,
      failedStores: 1,
      storeErrors: ['hobbylife: Failed to fetch products from the store.'],
    });

    const call = db.calls[0]!;
    expect(call.sql).toContain("set status = 'completed'");
    expect(call.sql).toContain('completed_stores = $5');
    expect(call.sql).toContain('failed_stores = $6');
    expect(call.params.slice(2, 6)).toEqual([10, 2, 4, 1]);
    expect(call.params[6]).toBe('1 store scan(s) failed: hobbylife: Failed to fetch products from the store.');
  });

  it('leaves the error empty when every store completed', async () => {
    const db = new FakeDb();

    await completeScanJob(db as never, { id: 42, scan_run_id: null }, 'worker-1', { processed: 10, matched: 2 });

    expect(db.calls[0]!.params.slice(4, 7)).toEqual([0, 0, null]);
  });
});
