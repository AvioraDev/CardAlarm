import fs from 'node:fs';
import path from 'node:path';

function readRootFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', ...segments), 'utf8');
}

describe('CAR-25 reference checklist performance', () => {
  const dbSource = readRootFile('engine', 'src', 'db.ts');
  const ingestSource = readRootFile('engine', 'src', 'ingest.ts');
  const migration = readRootFile(
    'supabase',
    'migrations',
    '20260513007000_reference_checklist_lookup_indexes.sql'
  );
  const notes = readRootFile('docs', 'architecture', 'reference-checklist-matching-performance.md');

  it('adds checklist lookup indexes for card number and set context', () => {
    expect(migration).toContain('idx_reference_checklists_card_number');
    expect(migration).toContain('idx_reference_checklists_card_number_set_name');
    expect(migration).toContain('create extension if not exists pg_trgm');
    expect(migration).toContain('idx_reference_checklists_set_name_trgm');
  });

  it('loads checklist rows by card number in one batched query', () => {
    expect(dbSource).toContain('export async function getChecklistsByNumbers');
    expect(dbSource).toContain('where card_number = any($1::text[])');
    expect(dbSource).toContain('uniqueCardNumbers.length === 0');
  });

  it('primes a page-level checklist cache before matching products', () => {
    expect(ingestSource).toContain('const checklistLookup = createChecklistLookup()');
    expect(ingestSource).toContain('checklistLookup.missingCardNumbers(pageCardNumbers)');
    expect(ingestSource).toContain('getChecklistsByNumbers(db, missingChecklistNumbers)');
    expect(ingestSource).toContain('checklistLookup.markLoaded(missingChecklistNumbers)');
    expect(ingestSource).toContain('checklistLookup');
  });

  it('documents the before and after query profile', () => {
    expect(notes).toContain('10,419');
    expect(notes).toContain('approximately 237 seconds');
    expect(notes).toContain('no longer perform one reference checklist query per candidate product');
  });
});
