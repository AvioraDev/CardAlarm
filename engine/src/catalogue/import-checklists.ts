import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as xlsx from 'xlsx';
import { closeDb, getDb, withTransaction } from '../db';
import { toCsv } from '../accuracy/csv';
import {
  isSubsetSheet,
  normalizeCatalogueName,
  parseSubsetSheetDetailed,
  productFromFileName,
  type ChecklistProduct,
  type ChecklistSubset,
  type SheetRow,
  type SheetTrace,
} from './checklist-parser';
import { applyTeamsRookies, markUnknownRookies, readTeamsRookies, validateChecklist, type AcceptedDiscrepancy, type ValidationReport } from './checklist-validate';

/**
 * Loads Beckett-format checklist workbooks into the checklist_* catalogue tables.
 *
 * Usage:
 *   npx tsx --env-file=web/.env.local engine/src/catalogue/import-checklists.ts [dir ...] [options]
 *
 *   --dry-run          parse and validate only; never connects to the database
 *   --force            replace products already in the catalogue (then reclassify)
 *   --report-dir DIR   where the per-workbook validation reports are saved
 *                      (default docs/catalogue/import-reports/<date>-<mode>)
 *
 * Defaults to docs/sets and docs/sets/incoming. Products already in the catalogue are skipped, because
 * classifications point at their rows.
 *
 * A workbook that fails validation is NOT imported and the run exits non-zero. The result is also checked
 * inside the import transaction, which rolls back if the database does not match what was parsed.
 */

const DEFAULT_DIRS = ['docs/sets', 'docs/sets/incoming'];
/**
 * Discrepancies in the source files themselves that were reviewed and accepted (a card number the file skips, a
 * declared total that is higher than the rows listed). Each has a reason. Anything not listed here fails the import.
 */
const ACCEPTED_FILE = 'docs/catalogue/import-accepted-discrepancies.json';

export function loadAcceptedDiscrepancies(file = ACCEPTED_FILE): AcceptedDiscrepancy[] {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { accepted: AcceptedDiscrepancy[] }).accepted : [];
}

export interface ParsedChecklist {
  product: ChecklistProduct;
  subsets: ChecklistSubset[];
  /** Validation of this workbook against its own source sheets (CAR-77). */
  report: ValidationReport;
  traces: SheetTrace[];
}

/** Subsets that share a name and kind across sheets are one subset; their rows are merged. */
export function mergeSubsets(subsets: ChecklistSubset[]): ChecklistSubset[] {
  const merged = new Map<string, ChecklistSubset>();
  for (const subset of subsets) {
    const key = `${subset.kind}\u0000${normalizeCatalogueName(subset.name)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...subset, parallels: [...subset.parallels], cards: [...subset.cards] });
      continue;
    }
    existing.cards.push(...subset.cards);
    existing.parallels.push(...subset.parallels);
  }
  return Array.from(merged.values()).filter(subset => normalizeCatalogueName(subset.name) !== '');
}

export function parseChecklistFile(filePath: string, accepted: AcceptedDiscrepancy[] = loadAcceptedDiscrepancies()): ParsedChecklist | null {
  const fileName = path.basename(filePath);
  const product = productFromFileName(fileName);
  if (!product) return null;

  const workbook = xlsx.readFile(filePath);
  const parsedSubsets: ChecklistSubset[] = [];
  const traces: SheetTrace[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (!isSubsetSheet(sheetName)) continue;
    const rows = xlsx.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName]!, { header: 1, defval: '' });
    const { subsets, trace } = parseSubsetSheetDetailed(sheetName, rows);
    parsedSubsets.push(...subsets);
    traces.push(trace);
  }
  const subsets = mergeSubsets(parsedSubsets);

  // Rookies are recovered from the source: rookie-named blocks (done while parsing) and the RC flags in the Teams sheet.
  const teamsSheet = workbook.SheetNames.find(name => /^teams?$/i.test(name));
  const teamRows = teamsSheet ? xlsx.utils.sheet_to_json<SheetRow>(workbook.Sheets[teamsSheet]!, { header: 1, defval: '' }) : [];
  const teams = applyTeamsRookies(subsets, readTeamsRookies(teamRows));
  markUnknownRookies(subsets);

  const report = validateChecklist({ file: fileName, product, subsets, traces, teams, sheetNames: workbook.SheetNames, sha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'), accepted });
  return { product, subsets, report, traces };
}

function isSinglePlayerName(name: string): boolean {
  return !/[\/&]|\band\b/i.test(name) && name.trim().split(/\s+/).length >= 2;
}

async function assertMigrationApplied(): Promise<void> {
  const result = await getDb().query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'checklist_subsets' and column_name = 'parent_subset_id'`
  );
  if (result.rows.length === 0) {
    throw new Error('checklist_subsets.parent_subset_id is missing: apply migration 20261012020000_checklist_blocks.sql first');
  }
}

async function importChecklist(parsed: ParsedChecklist): Promise<{ subsets: number; cards: number; parallels: number }> {
  const { product, subsets } = parsed;
  const subsetRows = subsets.map((subset, index) => ({
    position: index,
    name: subset.name,
    normalized_name: normalizeCatalogueName(subset.name),
    kind: subset.kind,
    declared_card_count: subset.declaredCardCount,
    number_from: subset.numberFrom ?? null,
    number_to: subset.numberTo ?? null,
    parent_normalized_name: subset.parentName ? normalizeCatalogueName(subset.parentName) : null,
  }));
  const parallelRows = subsets.flatMap((subset, index) =>
    subset.parallels.map(parallel => ({
      position: index,
      name: parallel.name,
      normalized_name: normalizeCatalogueName(parallel.name),
      serial_limit: parallel.serialLimit,
      note: parallel.note,
    }))
  );
  const cardRows = subsets.flatMap((subset, index) =>
    subset.cards.map(card => ({
      position: index,
      card_number: card.cardNumber,
      player_name: card.playerName,
      normalized_player_name: normalizeCatalogueName(card.playerName),
      team_name: card.teamName,
      is_rookie: card.isRookie,
      serial_limit: card.serialLimit,
    }))
  );
  const playerNames = [...new Set(cardRows.map(card => card.player_name).filter(isSinglePlayerName))];
  const expectedRookies = cardRows.filter(card => card.is_rookie).length;
  const expectedBlocks = subsetRows.filter(subset => subset.parent_normalized_name !== null).length;

  await withTransaction(async client => {
    await client.query(
      `delete from public.checklist_products
       where sport = 'basketball' and season = $1 and normalized_product_line = $2`,
      [product.season, normalizeCatalogueName(product.productLine)]
    );
    const inserted = await client.query<{ id: string }>(
      `insert into public.checklist_products (season, brand, product_line, normalized_product_line, source_file)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [product.season, product.brand, product.productLine, normalizeCatalogueName(product.productLine), product.sourceFile]
    );
    const productId = inserted.rows[0]!.id;

    // players.normalized_name is the lower-cased full name; keep that convention for new players.
    await client.query(
      `insert into public.players (full_name, normalized_name, sport, league)
       select name, lower(name), 'basketball', 'NBA'
       from unnest($1::text[]) as name
       on conflict do nothing`,
      [playerNames]
    );

    await client.query(
      `with subset_input as (
         select * from jsonb_to_recordset($2::jsonb) as x(
           position integer, name text, normalized_name text, kind text, declared_card_count integer,
           number_from integer, number_to integer
         )
       ),
       inserted_subsets as (
         insert into public.checklist_subsets (product_id, name, normalized_name, kind, declared_card_count, number_from, number_to)
         select $1, name, normalized_name, kind, declared_card_count, number_from, number_to
         from subset_input
         returning id, kind, normalized_name
       ),
       subset_ids as (
         select si.position, s.id
         from subset_input si
         join inserted_subsets s on s.kind = si.kind and s.normalized_name = si.normalized_name
       ),
       inserted_parallels as (
         insert into public.checklist_parallels (subset_id, name, normalized_name, serial_limit, note)
         select s.id, p.name, p.normalized_name, p.serial_limit, p.note
         from jsonb_to_recordset($3::jsonb) as p(
           position integer, name text, normalized_name text, serial_limit integer, note text
         )
         join subset_ids s on s.position = p.position
         returning id
       )
       insert into public.checklist_cards (
         subset_id, player_id, card_number, player_name, normalized_player_name, team_name, is_rookie, serial_limit
       )
       select s.id, pl.id, c.card_number, c.player_name, c.normalized_player_name, c.team_name, c.is_rookie, c.serial_limit
       from jsonb_to_recordset($4::jsonb) as c(
         position integer, card_number text, player_name text, normalized_player_name text,
         team_name text, is_rookie boolean, serial_limit integer
       )
       join subset_ids s on s.position = c.position
       left join public.players pl on pl.normalized_name = lower(c.player_name)`,
      [productId, JSON.stringify(subsetRows), JSON.stringify(parallelRows), JSON.stringify(cardRows)]
    );

    // Link each block to its base set.
    await client.query(
      `update public.checklist_subsets child
       set parent_subset_id = parent.id
       from jsonb_to_recordset($2::jsonb) as x(kind text, normalized_name text, parent_normalized_name text)
       join public.checklist_subsets parent
         on parent.product_id = $1 and parent.kind = x.kind and parent.normalized_name = x.parent_normalized_name
       where child.product_id = $1 and child.kind = x.kind and child.normalized_name = x.normalized_name
         and x.parent_normalized_name is not null`,
      [productId, JSON.stringify(subsetRows)]
    );

    // The database must hold exactly what was parsed. If not, throw: the transaction rolls back.
    const check = await client.query<{ subsets: string; parallels: string; cards: string; rookies: string; blocks: string }>(
      `select
         (select count(*) from public.checklist_subsets where product_id = $1) as subsets,
         (select count(*) from public.checklist_parallels pa join public.checklist_subsets s on s.id = pa.subset_id where s.product_id = $1) as parallels,
         (select count(*) from public.checklist_cards c join public.checklist_subsets s on s.id = c.subset_id where s.product_id = $1) as cards,
         (select count(*) from public.checklist_cards c join public.checklist_subsets s on s.id = c.subset_id where s.product_id = $1 and c.is_rookie) as rookies,
         (select count(*) from public.checklist_subsets where product_id = $1 and parent_subset_id is not null) as blocks`,
      [productId]
    );
    const got = check.rows[0]!;
    const mismatches = [
      ['subsets', subsetRows.length, Number(got.subsets)],
      ['parallels', parallelRows.length, Number(got.parallels)],
      ['cards', cardRows.length, Number(got.cards)],
      ['rookies', expectedRookies, Number(got.rookies)],
      ['blocks', expectedBlocks, Number(got.blocks)],
    ].filter(([, expected, actual]) => expected !== actual);
    if (mismatches.length > 0) {
      throw new Error(
        `Import of ${product.season} ${product.productLine} does not match the source: ${mismatches
          .map(([name, expected, actual]) => `${name} expected ${expected} got ${actual}`)
          .join(', ')}`
      );
    }
  });

  return { subsets: subsetRows.length, cards: cardRows.length, parallels: parallelRows.length };
}

function optionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function writeReports(dir: string, reports: ValidationReport[]): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const report of reports) {
    fs.writeFileSync(path.join(dir, `${report.file.replace(/\.xlsx$/i, '')}.json`), JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  const header = ['file', 'season', 'product', 'ok', 'errors', 'accepted', 'warnings', 'subsets', 'blocks', 'parallels', 'cards', 'rookies', 'teams_rc_rows', 'teams_rc_matched', 'first_finding'];
  const rows = reports.map(report => [
    report.file,
    report.season,
    report.productLine,
    report.ok ? 'yes' : 'NO',
    String(report.errors),
    String(report.accepted),
    String(report.warnings),
    String(report.stats.subsets),
    String(report.stats.blocks),
    String(report.stats.parallels),
    String(report.stats.cards),
    String(report.stats.rookies),
    String(report.stats.rookiesFromTeams.sourceRows),
    String(report.stats.rookiesFromTeams.matchedRows),
    report.findings[0] ? `${report.findings[0].level}: ${report.findings[0].message}` : '',
  ]);
  fs.writeFileSync(path.join(dir, 'summary.csv'), toCsv([header, ...rows]), 'utf8');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const reportDirArg = optionValue(args, '--report-dir');
  const dirArgs = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--report-dir');
  const dirs = dirArgs.length > 0 ? dirArgs : DEFAULT_DIRS;
  const files = dirs
    .filter(dir => fs.existsSync(dir))
    .flatMap(dir => fs.readdirSync(dir).filter(file => file.toLowerCase().endsWith('.xlsx')).map(file => path.join(dir, file)));
  const reportDir = path.resolve(reportDirArg ?? `docs/catalogue/import-reports/${new Date().toISOString().slice(0, 10)}-${dryRun ? 'dry-run' : 'import'}`);

  const totals = { products: 0, skipped: 0, failed: 0, subsets: 0, cards: 0, parallels: 0 };
  const reports: ValidationReport[] = [];
  const inCatalogue = new Set<string>();
  if (!dryRun) {
    await assertMigrationApplied();
    const existing = await getDb().query<{ season: string; normalized_product_line: string }>(
      `select season, normalized_product_line from public.checklist_products where sport = 'basketball'`
    );
    for (const row of existing.rows) inCatalogue.add(`${row.season}\u0000${row.normalized_product_line}`);
  }
  // A product downloaded twice ("...Checklist(1).xlsx") resolves to the same product and is imported once.
  const seen = new Set<string>();

  try {
    for (const file of files) {
      const parsed = parseChecklistFile(file);
      if (!parsed) {
        console.warn(`Skipping ${file}: file name is not a recognised basketball checklist`);
        continue;
      }
      const key = `${parsed.product.season}\u0000${normalizeCatalogueName(parsed.product.productLine)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      reports.push(parsed.report);

      const label = `${parsed.product.season} ${parsed.product.brand} ${parsed.product.productLine}`;
      if (!parsed.report.ok) {
        totals.failed++;
        console.error(`FAILED validation, not imported: ${label}`);
        for (const finding of parsed.report.findings.filter(item => item.level === 'error').slice(0, 5)) console.error(`    ${finding.code}: ${finding.message}`);
        continue;
      }
      if (dryRun) {
        totals.products++;
        totals.cards += parsed.report.stats.cards;
        continue;
      }
      if (inCatalogue.has(key) && !force) {
        totals.skipped++;
        continue;
      }

      const result = await importChecklist(parsed);
      totals.products++;
      totals.subsets += result.subsets;
      totals.cards += result.cards;
      totals.parallels += result.parallels;
      console.log(`${label}: ${result.subsets} subsets, ${result.cards} cards, ${result.parallels} parallels`);
    }
    writeReports(reportDir, reports);
    console.log(
      `\n${dryRun ? 'Validated' : 'Imported'} ${totals.products} products` +
        `${dryRun ? '' : ` (${totals.skipped} already in the catalogue)`}, ${totals.failed} failed validation. Reports: ${reportDir}`
    );
    if (totals.failed > 0) process.exitCode = 1;
  } finally {
    if (!dryRun) await closeDb();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Checklist import failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
