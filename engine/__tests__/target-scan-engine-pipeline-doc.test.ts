import fs from 'node:fs';
import path from 'node:path';

describe('CAR-31 target scan engine architecture document', () => {
  const doc = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'docs', 'architecture', 'target-scan-engine-pipeline.md'),
    'utf8'
  );

  it('defines the target durable scan pipeline and queue tables', () => {
    expect(doc).toContain('scan_jobs');
    expect(doc).toContain('store_scan_jobs');
    expect(doc).toContain('page_fetch_tasks');
    expect(doc).toContain('engine_workers');
    expect(doc).toContain('scan_runs / store_scan_runs progress projections');
  });

  it('documents worker claiming, heartbeat, cancellation, and stale recovery', () => {
    expect(doc).toContain('FOR UPDATE SKIP LOCKED');
    expect(doc).toContain('heartbeat_at');
    expect(doc).toContain('Cancellation is cooperative');
    expect(doc).toContain('Stale Recovery');
    expect(doc).toContain('cancel_requested_at');
  });

  it('preserves shallow/full OOS safety boundaries', () => {
    expect(doc).toContain('OOS marking is allowed only when all are true');
    expect(doc).toContain('scan strategy is `full`');
    expect(doc).toContain('OOS marking is forbidden for');
    expect(doc).toContain('`shallow` scans');
    expect(doc).toContain('early-stopped');
  });

  it('links the design to CAR-25, CAR-29, and incremental implementation phases', () => {
    expect(doc).toContain('CAR-25');
    expect(doc).toContain('CAR-29');
    expect(doc).toContain('Phase 1 — Job schema and claim helpers');
    expect(doc).toContain('Phase 8 — Read model preparation');
  });
});
