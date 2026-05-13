import fs from 'node:fs';
import path from 'node:path';
import {
  alertMaxAttempts,
  alertProcessLimit,
  buildAlertDedupeKey,
  claimPendingAlerts,
  emailMode,
  sendAlertEmail,
} from '../src/alerts';

describe('watchlist email alerts', () => {
  const originalEnv = process.env;
  const alertsSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'alerts.ts'), 'utf8');
  const ingestSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ingest.ts'), 'utf8');
  const reconciliationSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'watchlist-reconciliation.ts'), 'utf8');
  const migrationSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260513000000_alerts.sql'), 'utf8');
  const processingMigrationSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260513006000_alert_processing_status.sql'), 'utf8');
  const webAlertsSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'src', 'lib', 'alerts.ts'), 'utf8');

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('builds stable user-watchlist-product dedupe keys', () => {
    expect(buildAlertDedupeKey('user-1', 42, 99)).toBe('new_watchlist_match:email:user-1:42:99');
  });

  it('defaults to safe log email mode and clamps processing config', () => {
    delete process.env.CARDALARM_EMAIL_MODE;
    process.env.CARDALARM_ALERT_PROCESS_LIMIT = '0';
    process.env.CARDALARM_ALERT_MAX_ATTEMPTS = 'bad';

    expect(emailMode()).toBe('log');
    expect(alertProcessLimit()).toBe(1);
    expect(alertMaxAttempts()).toBe(3);
  });

  it('log mode does not call Resend', async () => {
    process.env.CARDALARM_EMAIL_MODE = 'log';
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    const result = await sendAlertEmail({
      id: 123,
      recipient_email: 'collector@example.com',
      subject: 'CardAlarm found a match',
      payload: {
        watchlistName: 'Kevin Durant',
        productTitle: '2023-24 Panini Prizm Kevin Durant',
        price: 25,
        source: 'topplay',
        url: 'https://example.com/card',
        confidence: 0.88,
        reasons: ['Player matched'],
      },
      attempts: 0,
    });

    expect(result).toEqual({ provider: 'log', providerMessageId: 'log-123' });
    expect(fetchSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('defines persistent alert records with dedupe and retry status fields', () => {
    expect(migrationSource).toContain('create table if not exists public.alerts');
    expect(migrationSource).toContain("status text not null check (status in ('pending', 'sent', 'failed', 'suppressed'))");
    expect(migrationSource).toContain('dedupe_key text not null');
    expect(migrationSource).toContain('create unique index if not exists idx_alerts_dedupe_key');
    expect(migrationSource).toContain('create policy alerts_select_own');
    expect(migrationSource).not.toContain('for insert to authenticated');
  });

  it('adds a processing status for transaction-safe alert claims', () => {
    expect(processingMigrationSource).toContain("check (status in ('pending', 'processing', 'sent', 'failed', 'suppressed'))");
    expect(processingMigrationSource).toContain('idx_alerts_claimable');
    expect(processingMigrationSource).toContain('idx_alerts_processing_stale');
  });

  it('enqueues pending or suppressed alerts and promotes suppressed records only when enabled', () => {
    expect(alertsSource).toContain("case when w.notification_enabled then 'pending' else 'suppressed' end");
    expect(alertsSource).toContain("'new_watchlist_match:email:' || w.user_id || ':' || w.id || ':' || sp.id");
    expect(alertsSource).toContain('on conflict (dedupe_key) do update');
    expect(alertsSource).toContain("public.alerts.status = 'suppressed'");
    expect(alertsSource).toContain("excluded.status = 'pending'");
    expect(alertsSource).toContain("status = 'sent'");
    expect(alertsSource).toContain("status = 'processing'");
    expect(alertsSource).toContain('for update skip locked');
    expect(alertsSource).toContain("where id = $1\n           and status = 'processing'");
    expect(webAlertsSource).toContain("status = 'processing'");
    expect(webAlertsSource).toContain('for update skip locked');
  });

  it('claims pending alerts with one atomic update before sending', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });

    await claimPendingAlerts({ query } as never, 10, 4);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("update public.alerts a\n     set status = 'processing'"),
      [10, 4]
    );
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("where status in ('pending', 'failed')");
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('attempts = a.attempts + 1');
    expect(sql).toContain('returning a.id, a.recipient_email, a.subject, a.payload, a.attempts');
  });

  it('reconciles watchlist matches after scans before alert enqueue', () => {
    expect(ingestSource).toContain('reconcileActiveWatchlistMatches(db)');
    expect(ingestSource).toContain('enqueueAlertCandidates(db)');
    expect(ingestSource).toContain('processPendingAlerts(db)');
    expect(reconciliationSource).toContain('insert into public.watchlist_matches');
    expect(reconciliationSource).toContain('from public.watchlist_rules wr');
    expect(reconciliationSource).toContain('join public.store_products sp');
    expect(reconciliationSource).toContain('on conflict (watchlist_id, watchlist_rule_id, source, external_id)');
  });
});
