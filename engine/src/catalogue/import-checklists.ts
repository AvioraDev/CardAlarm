import fs from 'node:fs';
import path from 'node:path';
import * as xlsx from 'xlsx';
import { closeDb, getDb, withTransaction } from '../db';
import {
  isSubsetSheet,
  normalizeCatalogueName,
  parseSubsetSheet,
  productFromFileName,
  type ChecklistProduct,
  type ChecklistSubset,
  type SheetRow,
} from './checklist-parser';

/**
 * Loads Beckett-format checklist workbooks into the checklist_* catalogue tables.
 *
 * Usage:
 *   npx tsx --env-file=web/.env.local engine/src/catalogue/import-checklists.ts [dir ...]
 *
 * Defaults to docs/sets and docs/sets/incoming. Products already in the catalogue are skipped, because
 * classifications point at their rows; pass --force to replace them, then reclassify.
 */

const DEFAULT_DIRS = ['docs/sets', 'docs/sets/incoming'];

export interface ParsedChecklist {
  product: ChecklistProduct;
  subsets: ChecklistSubset[];
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

export function parseChecklistFile(filePath: string): ParsedChecklist | null {
  const product = productFromFileName(path.basename(filePath));
  if (!product) return null;

  const workbook = xlsx.readFile(filePath);
  const subsets: ChecklistSubset[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (!isSubsetSheet(sheetName)) continue;
    const rows = xlsx.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName]!, { header: 1, defval: '' });
    subsets.push(...parseSubsetSheet(sheetName, rows));
  }
  return { product, subsets: mergeSubsets(subsets) };
}

function isSinglePlayerName(name: string): boolean {
  return !/[\/&]|\band\b/i.test(name) && name.trim().split(/\s+/).length >= 2;
}

async function importChecklist(parsed: ParsedChecklist): Promise<{ subsets: number; cards: number; parallels: number }> {
  const { product, subsets } = parsed;
  const subsetRows = subsets.map((subset, index) => ({
    position: index,
    name: subset.name,
    normalized_name: normalizeCatalogueName(subset.name),
    kind: subset.kind,
    declared_card_count: subset.declaredCardCount,
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
           position integer, name text, normalized_name text, kind text, declared_card_count integer
         )
       ),
       inserted_subsets as (
         insert into public.checklist_subsets (product_id, name, normalized_name, kind, declared_card_count)
         select $1, name, normalized_name, kind, declared_card_count
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
  });

  return { subsets: subsetRows.length, cards: cardRows.length, parallels: parallelRows.length };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dirArgs = args.filter(arg => !arg.startsWith('--'));
  const dirs = dirArgs.length > 0 ? dirArgs : DEFAULT_DIRS;
  const files = dirs
    .filter(dir => fs.existsSync(dir))
    .flatMap(dir => fs.readdirSync(dir).filter(file => file.toLowerCase().endsWith('.xlsx')).map(file => path.join(dir, file)));

  const db = getDb();
  const existing = await db.query<{ season: string; normalized_product_line: string }>(
    `select season, normalized_product_line from public.checklist_products where sport = 'basketball'`
  );
  const inCatalogue = new Set(existing.rows.map(row => `${row.season}\u0000${row.normalized_product_line}`));
  const totals = { products: 0, skipped: 0, subsets: 0, cards: 0, parallels: 0 };
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
      if (inCatalogue.has(key) && !force) {
        totals.skipped++;
        continue;
      }

      const result = await importChecklist(parsed);
      totals.products++;
      totals.subsets += result.subsets;
      totals.cards += result.cards;
      totals.parallels += result.parallels;
      console.log(
        `${parsed.product.season} ${parsed.product.brand} ${parsed.product.productLine}: ${result.subsets} subsets, ${result.cards} cards, ${result.parallels} parallels`
      );
    }
    console.log(
      `\nImported ${totals.products} products (${totals.skipped} already in the catalogue), ${totals.subsets} subsets, ${totals.cards} cards, ${totals.parallels} parallels.`
    );
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Checklist import failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
