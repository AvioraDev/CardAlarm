import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260513004000_alert_fk_indexes.sql'),
  'utf8',
);

describe('alert foreign-key index migration', () => {
  it('adds indexes for alert FK columns flagged by advisors', () => {
    expect(migration).toContain('create index if not exists idx_alerts_product_card_match_id');
    expect(migration).toContain('on public.alerts (product_card_match_id)');
    expect(migration).toContain('create index if not exists idx_alerts_watchlist_match_id');
    expect(migration).toContain('on public.alerts (watchlist_match_id)');
  });

  it('does not disturb existing alert dedupe, retry, user, watchlist, or store indexes', () => {
    const alertsMigration = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260513000000_alerts.sql'),
      'utf8',
    );

    expect(alertsMigration).toContain('idx_alerts_dedupe_key');
    expect(alertsMigration).toContain('idx_alerts_retry');
    expect(alertsMigration).toContain('idx_alerts_user_created_at');
    expect(alertsMigration).toContain('idx_alerts_watchlist');
    expect(alertsMigration).toContain('idx_alerts_store_product');
  });

  it('includes remote verification and advisor follow-up notes', () => {
    expect(migration).toContain('Verification SQL after deploy');
    expect(migration).toContain('pg_indexes');
    expect(migration).toContain('Advisor verification');
    expect(migration).toContain('public.alerts.product_card_match_id');
    expect(migration).toContain('public.alerts.watchlist_match_id');
  });
});
