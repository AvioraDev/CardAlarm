import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260513003000_product_classifications_rls.sql'),
  'utf8',
);

describe('product_classifications RLS migration', () => {
  it('enables RLS conditionally for the existing Supabase table', () => {
    expect(migration).toContain("if to_regclass('public.product_classifications') is not null then");
    expect(migration).toContain('alter table public.product_classifications enable row level security');
  });

  it('adds only an authenticated select policy', () => {
    expect(migration).toContain('drop policy if exists product_classifications_select_authenticated');
    expect(migration).toContain('create policy product_classifications_select_authenticated');
    expect(migration).toContain('for select');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain('using (true)');
    expect(migration).not.toContain('for insert');
    expect(migration).not.toContain('for update');
    expect(migration).not.toContain('for delete');
    expect(migration).not.toContain('for all');
  });

  it('documents verification SQL and rollback notes', () => {
    expect(migration).toContain('Verification SQL after deploy');
    expect(migration).toContain('relrowsecurity');
    expect(migration).toContain('pg_policy');
    expect(migration).toContain('Rollback notes');
    expect(migration).toContain('disable row level security');
  });
});
