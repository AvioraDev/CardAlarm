import fs from 'node:fs';
import path from 'node:path';

function readWebFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'src', ...segments), 'utf8');
}

function readEngineFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', ...segments), 'utf8');
}

describe('admin/system-controlled scan architecture', () => {
  it('keeps scan trigger UI under the admin scans route only', () => {
    const adminScansPage = readWebFile('app', 'admin', 'scans', 'page.tsx');
    const dashboardPage = readWebFile('app', 'dashboard', 'page.tsx');
    const watchlistsPage = readWebFile('app', 'watchlists', 'page.tsx');
    const newWatchlistPage = readWebFile('app', 'watchlists', 'new', 'page.tsx');
    const watchlistDetailPage = readWebFile('app', 'watchlists', '[id]', 'page.tsx');

    expect(adminScansPage).toContain('await requireAdmin()');
    expect(adminScansPage).toContain('<ScanPanel');
    expect(dashboardPage).not.toContain('ScanPanel');
    expect(dashboardPage).not.toContain('startScan');
    expect(watchlistsPage).not.toContain('ScanPanel');
    expect(watchlistsPage).not.toContain('startScan');
    expect(newWatchlistPage).not.toContain('ScanPanel');
    expect(newWatchlistPage).not.toContain('startScan');
    expect(watchlistDetailPage).not.toContain('ScanPanel');
    expect(watchlistDetailPage).not.toContain('startScan');
  });

  it('requires admin access before enqueueing a scan job', () => {
    const actions = readWebFile('lib', 'actions.ts');
    const startScanBody = actions.slice(actions.indexOf('export async function startScan'));

    expect(startScanBody).toContain('const admin = await requireAdmin()');
    expect(startScanBody.indexOf('await requireAdmin()')).toBeLessThan(startScanBody.indexOf('enqueueScanJob'));
    expect(startScanBody).toContain('await enqueueScanJob(mode, admin.user_id)');
    expect(startScanBody).toContain('external store scans are admin/system controlled only');
    expect(startScanBody).toContain('revalidatePath("/admin/scans")');
    expect(startScanBody).not.toContain('revalidatePath("/dashboard")');
    expect(startScanBody).not.toContain('spawn(');
    expect(startScanBody).not.toContain('child.unref()');
  });

  it('keeps customer watchlist actions scoped to cached inventory backfill only', () => {
    const watchlistActions = readWebFile('lib', 'watchlist-actions.ts');

    expect(watchlistActions).toContain('reconcile against cached');
    expect(watchlistActions).toContain('backfillWatchlist(user.id');
    expect(watchlistActions).not.toContain('startScan');
    expect(watchlistActions).not.toContain('spawn(');
    expect(watchlistActions).not.toContain('engine/src/scan.ts');
  });

  it('locks duplicate global and per-store scan runs at the database boundary', () => {
    const db = readEngineFile('src', 'db.ts');

    expect(db).toContain("pg_advisory_xact_lock(hashtext('cardalarm:scan_runs'))");
    expect(db).toContain("throw new Error('A scan is already running.')");
    expect(db).toContain("pg_advisory_xact_lock(hashtext('cardalarm:store_scan_runs:' || $2))");
    expect(db).toContain('A scan is already running for store');
    expect(db).toContain("started_at < now() - interval '30 minutes'");
  });

  it('closes the scan database connection when duplicate scan creation fails', () => {
    const scan = readEngineFile('src', 'scan.ts');

    expect(scan).toContain('let runId: number | null = null');
    expect(scan).toContain('runId = await createScanRun(db, mode)');
    expect(scan).toContain('if (runId !== null)');
    expect(scan).toContain('await closeDb()');
  });
});
