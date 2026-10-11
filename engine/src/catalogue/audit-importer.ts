import fs from 'node:fs';
import path from 'node:path';
import * as xlsx from 'xlsx';
import { closeDb, getDb } from '../db';
import { toCsv } from '../accuracy/csv';
import { parseChecklistFile } from './import-checklists';
import { isSubsetSheet, normalizeCatalogueName, type SheetRow } from './checklist-parser';

/**
 * Compares every source checklist workbook with what the importer makes of it and with what is in the
 * catalogue, and lists what was flattened or lost (CAR-77 audit).
 *
 * Three independent checks per workbook:
 *   1. Block headers: single-cell rows such as "Crusade - #516-545" that mark a block of the base set.
 *      The parser treats single-cell rows outside a subset header as notes and drops them.
 *   2. Master sheet labels: the Master sheet lists every subset and subset+parallel combination. Any label
 *      that is neither a parsed subset nor a parsed subset+parallel was lost or misclassified.
 *   3. Catalogue vs parser: subset, card and parallel counts in the database against a fresh parse.
 *
 * Usage:
 *   npx tsx --env-file=web/.env.local engine/src/catalogue/audit-importer.ts [--out docs/accuracy/importer-audit-001.csv]
 */

const DIRS = ['docs/sets', 'docs/sets/incoming'];
const BLOCK_HEADER = /^(.{2,60}?)\s*[-–:]\s*#?\s*([A-Za-z]*\d+[A-Za-z]*)\s*[-–]\s*#?\s*([A-Za-z]*\d+[A-Za-z]*)\s*$/;
const COUNT_ROW = /^\d[\d,]*\s+cards?\b/i;

function rowCells(row: SheetRow): string[] {
  return row.map(cell => (cell === null || cell === undefined ? '' : String(cell).replace(/\s+/g, ' ').trim())).filter(cell => cell !== '');
}

interface Finding {
  file: string;
  season: string;
  product: string;
  sourceCardRows: number;
  parsedSubsets: number;
  parsedCards: number;
  cardRowsNotParsed: number;
  baseSheetWithNoBaseSubset: string;
  parsedParallels: number;
  blockHeadersDropped: string;
  masterLabels: number;
  masterLabelsUnaccounted: number;
  masterUnaccountedExamples: string;
  dbSubsets: number | '';
  dbCards: number | '';
  dbParallels: number | '';
  dbMatchesParser: string;
}


const RAW_CARD_ROW = /^#?[A-Za-z0-9]{1,8}(?:[-.][A-Za-z0-9]{1,8}){0,3}$/;

/** Rows in the subset sheets that look like a card: a short card number then a name containing letters. */
function sourceCardRows(workbook: xlsx.WorkBook): number {
  let count = 0;
  for (const sheetName of workbook.SheetNames) {
    if (!isSubsetSheet(sheetName)) continue;
    const rows = xlsx.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName]!, { header: 1, defval: '' });
    for (const row of rows) {
      const cells = rowCells(row);
      if (cells.length >= 2 && RAW_CARD_ROW.test(cells[0]!) && /\d/.test(cells[0]!) && /[A-Za-z]{2}/.test(cells[1]!) && !COUNT_ROW.test(cells[0]!)) count += 1;
    }
  }
  return count;
}

function blockHeaders(workbook: xlsx.WorkBook): string[] {
  const found: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (!isSubsetSheet(sheetName)) continue;
    const rows = xlsx.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName]!, { header: 1, defval: '' });
    const lines = rows.map(rowCells);
    lines.forEach((line, index) => {
      if (line.length !== 1 || COUNT_ROW.test(line[0]!)) return;
      const match = BLOCK_HEADER.exec(line[0]!);
      if (!match) return;
      // A subset header is followed by its "N cards" row; a block header is not.
      const next = lines.slice(index + 1).find(candidate => candidate.length > 0);
      if (next && next.length === 1 && COUNT_ROW.test(next[0]!)) return;
      found.push(`${sheetName}: ${line[0]}`);
    });
  }
  return found;
}

function masterLabels(workbook: xlsx.WorkBook): string[] {
  const sheetName = workbook.SheetNames.find(name => /^master$/i.test(name));
  if (!sheetName) return [];
  const rows = xlsx.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName]!, { header: 1, defval: '' });
  const labels = new Set<string>();
  for (const row of rows) {
    const cells = rowCells(row);
    if (cells.length < 3) continue;
    labels.add(cells[0]!);
  }
  return [...labels];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = path.resolve(outIndex === -1 ? 'docs/accuracy/importer-audit-001.csv' : args[outIndex + 1]!);

  const db = getDb();
  const dbProducts = await db.query<{ source_file: string; subsets: string; cards: string; parallels: string }>(
    `select p.source_file,
            count(distinct s.id) subsets,
            (select count(*) from public.checklist_cards c join public.checklist_subsets s2 on s2.id = c.subset_id where s2.product_id = p.id) cards,
            (select count(*) from public.checklist_parallels pa join public.checklist_subsets s3 on s3.id = pa.subset_id where s3.product_id = p.id) parallels
     from public.checklist_products p left join public.checklist_subsets s on s.product_id = p.id
     where p.sport = 'basketball' group by p.id, p.source_file`
  );
  const dbBySource = new Map(dbProducts.rows.map(row => [row.source_file, row]));

  const findings: Finding[] = [];
  for (const dir of DIRS) {
    const absolute = path.resolve(dir);
    if (!fs.existsSync(absolute)) continue;
    for (const fileName of fs.readdirSync(absolute).filter(name => name.toLowerCase().endsWith('.xlsx')).sort()) {
      const filePath = path.join(absolute, fileName);
      const parsed = parseChecklistFile(filePath);
      if (!parsed) continue;
      const workbook = xlsx.readFile(filePath);

      // A Master label is accounted for when it names a parsed subset, a subset with one of its parallels
      // (either order), or, for base-kind subsets, the bare word "Base" / "Base Set" / the parallel alone.
      const tokenKey = (value: string): string => normalizeCatalogueName(value).split(' ').filter(Boolean).sort().join(' ');
      const accounted = new Set<string>();
      for (const subset of parsed.subsets) {
        const subsetKeys = [normalizeCatalogueName(subset.name)];
        if (subset.kind === 'base') subsetKeys.push('base', 'base set');
        for (const subsetKey of subsetKeys) {
          accounted.add(tokenKey(subsetKey));
          for (const parallel of subset.parallels) {
            accounted.add(tokenKey(`${subsetKey} ${parallel.name}`));
            if (subset.kind === 'base') accounted.add(tokenKey(parallel.name));
          }
        }
      }
      const labels = masterLabels(workbook);
      const unaccounted = labels.filter(label => !accounted.has(tokenKey(label)));
      const blocks = blockHeaders(workbook);

      const parsedCards = parsed.subsets.reduce((sum, subset) => sum + subset.cards.length, 0);
      const parsedParallels = parsed.subsets.reduce((sum, subset) => sum + subset.parallels.length, 0);
      const stored = dbBySource.get(fileName);
      findings.push({
        file: fileName,
        season: parsed.product.season,
        product: parsed.product.productLine,
        sourceCardRows: sourceCardRows(workbook),
        parsedSubsets: parsed.subsets.length,
        parsedCards,
        cardRowsNotParsed: Math.max(0, sourceCardRows(workbook) - parsedCards),
        baseSheetWithNoBaseSubset: workbook.SheetNames.some(name => /^base/i.test(name)) && !parsed.subsets.some(subset => subset.kind === 'base') ? 'YES' : '',
        parsedParallels,
        blockHeadersDropped: blocks.join(' ; '),
        masterLabels: labels.length,
        masterLabelsUnaccounted: unaccounted.length,
        masterUnaccountedExamples: unaccounted.slice(0, 6).join(' ; '),
        dbSubsets: stored ? Number(stored.subsets) : '',
        dbCards: stored ? Number(stored.cards) : '',
        dbParallels: stored ? Number(stored.parallels) : '',
        dbMatchesParser: stored ? (Number(stored.subsets) === parsed.subsets.length && Number(stored.cards) === parsedCards && Number(stored.parallels) === parsedParallels ? 'yes' : 'NO') : 'not imported',
      });
    }
  }

  const header = Object.keys(findings[0]!) as Array<keyof Finding>;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, toCsv([header as string[], ...findings.map(finding => header.map(key => String(finding[key])))]), 'utf8');

  const withBlocks = findings.filter(finding => finding.blockHeadersDropped);
  const withLoss = findings.filter(finding => finding.masterLabelsUnaccounted > 0);
  const totalLabels = findings.reduce((sum, finding) => sum + finding.masterLabels, 0);
  const totalLost = findings.reduce((sum, finding) => sum + finding.masterLabelsUnaccounted, 0);
  console.log(JSON.stringify({
    workbooks: findings.length,
    withBlockHeadersDropped: withBlocks.length,
    baseSheetButNoBaseSubset: findings.filter(f => f.baseSheetWithNoBaseSubset === 'YES').length,
    sourceCardRows: findings.reduce((a, f) => a + f.sourceCardRows, 0),
    parsedCards: findings.reduce((a, f) => a + f.parsedCards, 0),
    cardRowsNotParsed: findings.reduce((a, f) => a + f.cardRowsNotParsed, 0),
    withMasterLabelsUnaccounted: withLoss.length,
    masterLabelsTotal: totalLabels,
    masterLabelsUnaccounted: totalLost,
    dbMatchesParser: findings.filter(f => f.dbMatchesParser === 'yes').length,
    dbDiffersFromParser: findings.filter(f => f.dbMatchesParser === 'NO').length,
    notImported: findings.filter(f => f.dbMatchesParser === 'not imported').length,
  }, null, 2));
  console.log(`Wrote ${out}`);
  await closeDb();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
