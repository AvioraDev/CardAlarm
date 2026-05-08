import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve(
  __dirname,
  '..',
  '..',
  'supabase',
  'migrations',
  '20260509000000_reconcile_scan_configuration_schema.sql'
);

describe('scan configuration schema reconciliation migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('defines store scan strategy and early-stop columns safely', () => {
    expect(sql).toContain('add column if not exists scan_strategy');
    expect(sql).toContain("set default 'incremental'");
    expect(sql).toContain('set not null');
    expect(sql).toContain("check (scan_strategy in ('incremental', 'full'))");
    expect(sql).toContain('add column if not exists early_stop_enabled');
    expect(sql).toContain('add column if not exists early_stop_unchanged_pages');
    expect(sql).toContain('check (early_stop_unchanged_pages between 1 and 50)');
  });

  it('defines per-store scan processed and matched metrics without removing legacy counts', () => {
    expect(sql).toContain('alter table public.store_scan_runs');
    expect(sql).toContain('add column if not exists products_processed');
    expect(sql).toContain('add column if not exists products_matched');
    expect(sql).not.toContain('drop column');
    expect(sql).not.toContain('products_created');
    expect(sql).not.toContain('products_updated');
  });

  it('backfills existing rows before enforcing not-null constraints', () => {
    expect(sql).toContain('update public.stores');
    expect(sql).toContain('where scan_strategy is null');
    expect(sql).toContain('update public.store_scan_runs');
    expect(sql).toContain('where products_processed is null');
    expect(sql).toContain('where products_matched is null');
  });
});
