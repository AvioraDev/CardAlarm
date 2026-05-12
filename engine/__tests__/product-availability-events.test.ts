import fs from 'node:fs';
import path from 'node:path';

describe('product availability events', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260513001000_product_availability_events.sql'),
    'utf8'
  );
  const dbSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'db.ts'), 'utf8');
  const docsSource = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'docs', 'architecture', 'product-availability-events.md'),
    'utf8'
  );

  it('adds a durable event table with supported event types and dedupe', () => {
    expect(migration).toContain('create table if not exists public.product_availability_events');
    expect(migration).toContain("event_type text not null check (event_type in ('first_seen', 'restocked', 'sold_out', 'price_changed', 'product_updated'))");
    expect(migration).toContain('store_product_id bigint not null references public.store_products');
    expect(migration).toContain('previous_availability boolean');
    expect(migration).toContain('current_availability boolean');
    expect(migration).toContain('previous_price numeric(12, 2)');
    expect(migration).toContain('current_price numeric(12, 2)');
    expect(migration).toContain('previous_product_fingerprint text');
    expect(migration).toContain('current_product_fingerprint text');
    expect(migration).toContain('create unique index if not exists idx_product_availability_events_dedupe_key');
    expect(migration).toContain('alter table public.product_availability_events enable row level security');
    expect(migration).not.toContain('for insert to authenticated');
  });

  it('creates scanner events from the batched store product upsert path', () => {
    expect(dbSource).toContain('existing_store as');
    expect(dbSource).toContain("when es.store_product_id is null then 'first_seen'");
    expect(dbSource).toContain("when es.old_availability = false and i.available = true then 'restocked'");
    expect(dbSource).toContain("when es.old_availability = true and i.available = false then 'sold_out'");
    expect(dbSource).toContain("when es.old_price is distinct from i.price then 'price_changed'");
    expect(dbSource).toContain("when es.old_product_fingerprint is distinct from i.content_hash then 'product_updated'");
    expect(dbSource).toContain('insert into product_availability_events');
    expect(dbSource).toContain("event_type || ':' || store_product_id || ':' || scan_token");
    expect(dbSource).toContain('on conflict (dedupe_key) do nothing');
  });

  it('creates sold out events from missing-source OOS reconciliation', () => {
    const functionStart = dbSource.indexOf('export async function markMissingSourceProductsOOS');
    const functionEnd = dbSource.indexOf('export async function reconcileSourceAvailability');
    const functionSource = dbSource.slice(functionStart, functionEnd);

    expect(functionSource).toContain('insert into product_availability_events');
    expect(functionSource).toContain("'sold_out'");
    expect(functionSource).toContain("'sold_out:' || c.id || ':' || $2");
    expect(functionSource).toContain("jsonb_build_object('source', c.source, 'externalId', c.external_product_id, 'reason', 'missing_from_scan')");
    expect(functionSource).toContain('on conflict (dedupe_key) do nothing');
  });

  it('documents event semantics and non-UX scope', () => {
    expect(docsSource).toContain('first_seen');
    expect(docsSource).toContain('restocked');
    expect(docsSource).toContain('sold_out');
    expect(docsSource).toContain('price_changed');
    expect(docsSource).toContain('product_updated');
    expect(docsSource).toContain('This is backend event infrastructure only.');
  });
});
