import fs from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '../db';
import { toCsv } from './csv';
import { loadCatalogueIndex } from '../classify/catalogue-index';
import { parseSeason, parseCardNumber } from '../classify/title-fields';

/**
 * Splits the card-number conflicts into format mismatches and genuine conflicts (read-only).
 *
 * For every live listing whose current classification says card_number_conflict, shows the number the title states and
 * the numbers the catalogue holds for the named player in the products the title names, then groups them by the
 * kind of mismatch. It changes nothing.
 *
 * Usage: npx tsx --env-file=web/.env.local engine/src/accuracy/conflict-analysis.ts [--version V] [--out FILE]
 */

const strip = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Letters and digits only, leading zeros dropped from digit runs: "SW-0AYO" -> "SWAYO", "007" -> "7". */
export const looseNumber = (value: string): string => strip(value).replace(/(^|[A-Z])0+(?=\d)/g, '$1');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (flag: string, fallback: string): string => (args.includes(flag) ? args[args.indexOf(flag) + 1]! : fallback);
  const version = opt('--version', 'jev-catalogue-v2');
  const out = path.resolve(opt('--out', 'docs/accuracy/conflict-analysis.csv'));
  const db = getDb();
  try {
    const catalogue = await loadCatalogueIndex(db);
    const { rows } = await db.query<{ id: string; title: string; tags: string[] | null; product_type: string | null }>(
      `select sp.id::text id, sp.title,
              case when jsonb_typeof(sp.raw_latest_payload->'tags') = 'array' then array(select jsonb_array_elements_text(sp.raw_latest_payload->'tags')) end tags,
              sp.raw_latest_payload->>'product_type' product_type
       from public.product_classifications pc join public.store_products sp on sp.id = pc.store_product_id
       where pc.classifier_type = 'jev' and pc.classifier_version = $1 and pc.review_reasons::text like '%card_number_conflict%'
         and sp.is_active and sp.current_availability`,
      [version]
    );
    const lines: string[][] = [['store_product_id', 'type', 'title', 'title_number', 'season', 'product', 'player', 'player_numbers_in_product', 'number_owner_in_product']];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const number = parseCardNumber(row.title);
      const { seasonCandidates } = parseSeason(row.title);
      const texts = [row.title, ...(row.tags ?? []), row.product_type ?? ''];
      const players = texts.flatMap(text => catalogue.findExactPlayers(text));
      const products = catalogue.findProducts([row.title, ...(row.tags ?? [])], seasonCandidates);
      let type = 'genuine: the number is not this player\'s in any named product';
      let shown = { product: '', player: players[0]?.name ?? '', numbers: '', owner: '' };
      for (const product of products) {
        for (const player of players) {
          const cards = catalogue.playerCards(product, player.name);
          const numbers = [...new Set(cards.map(card => card.cardNumber ?? ''))];
          const owner = product.subsets.flatMap(subset => subset.cards).filter(card => card.cardNumber?.toUpperCase() === number?.toUpperCase()).map(card => card.playerName);
          shown = { product: `${product.season} ${product.productLine}`, player: player.name, numbers: numbers.slice(0, 8).join(' '), owner: [...new Set(owner)].slice(0, 3).join(' / ') };
          const loose = number ? looseNumber(number) : '';
          if (loose && numbers.some(candidate => looseNumber(candidate) === loose)) { type = 'format: same number after normalising'; break; }
          if (number && numbers.some(candidate => strip(candidate).endsWith(strip(number)) || strip(number).endsWith(strip(candidate)) && strip(candidate).length >= 2)) type = 'format: prefix or suffix differs';
          else if (type.startsWith('genuine') && cards.length === 0) type = 'genuine: player has no card in the named product';
        }
        if (type.startsWith('format: same')) break;
      }
      if (!number) type = 'no number parsed';
      if (products.length === 0) type = 'no product identified here';
      counts.set(type, (counts.get(type) ?? 0) + 1);
      lines.push([row.id, type, row.title, number ?? '', seasonCandidates.join(' '), shown.product, shown.player, shown.numbers, shown.owner]);
    }
    fs.writeFileSync(out, toCsv(lines), 'utf8');
    console.log(rows.length, JSON.stringify(Object.fromEntries(counts), null, 2));
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
