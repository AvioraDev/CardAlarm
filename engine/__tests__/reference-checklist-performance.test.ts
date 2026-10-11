import fs from 'node:fs';
import path from 'node:path';

function readRootFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', ...segments), 'utf8');
}

describe('CAR-25 reference checklist performance', () => {
  const dbSource = readRootFile('engine', 'src', 'db.ts');
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

  it('keeps reference checklist lookups out of the scan loop and the engine database layer', () => {
    const ingestSource = readRootFile('engine', 'src', 'ingest.ts');

    // The title matcher that read reference_checklists is gone; listings resolve against checklist_* tables.
    expect(ingestSource).not.toContain('reference_checklists');
    expect(dbSource).not.toContain('reference_checklists');
  });

  it('documents the before and after query profile', () => {
    expect(notes).toContain('10,419');
    expect(notes).toContain('approximately 237 seconds');
    expect(notes).toContain('no longer perform one reference checklist query per candidate product');
  });
});
