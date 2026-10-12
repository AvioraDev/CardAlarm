import fs from 'fs';
import path from 'path';
import { closeDb, getDb } from '../db';
import { JEV_CLASSIFIER_VERSION } from '../classify/classifier';
import { parseSeason } from '../classify/title-fields';
import { toCsv } from './csv';

/**
 * Frequency table of live basketball singles that resolve to no catalogue product (D-007, CAR-75).
 *
 * The year and product are read from each title by a deterministic parser, not by Jev, so the table does
 * not inherit Jev's errors. The product vocabulary below is for REPORTING only: it names the groups in
 * this table and takes no part in matching.
 *
 * Usage:
 *   npx tsx --env-file=web/.env.local engine/src/accuracy/unmatched-frequency.ts [--out docs/accuracy/unmatched-frequency-001.csv] [--version jev-catalogue-v2]
 */

// Longest phrases first so "Donruss Optic" wins over "Donruss" and "Prizm Black" over "Prizm".
const PRODUCT_VOCABULARY = [
  'Topps Chrome Sapphire', 'Chrome Sapphire', 'Topps Chrome', 'Topps Hoops', 'Topps Finest', 'Topps Cosmic Chrome', 'Cosmic Chrome',
  'Donruss Optic', 'Contenders Optic', 'Donruss Elite', 'Hoops Premium Stock', 'Premium Stock', 'Totally Certified',
  'Prizm Black', 'National Treasures', 'Crown Royale', 'Court Kings', 'One and One', 'Gold Standard', 'Metal Universe',
  'SkyBox Metal Universe', 'Kobe Anthology', 'Stadium Club', 'Fleer Focus', 'Fleer Ultra', 'Hot Prospects', 'Upper Deck MVP',
  'Upper Deck', 'SP Authentic', 'Collector\'s Choice', 'NBA Hoops', 'Studio', 'Bowman Chrome', 'Bowman',
  'Optic', 'Donruss', 'Prizm', 'Select', 'Mosaic', 'Hoops', 'Chronicles', 'Contenders', 'Revolution', 'Obsidian', 'Origins', 'Flux',
  'Spectra', 'Certified', 'Recon', 'Illusions', 'Status', 'Absolute', 'Phoenix', 'Impeccable', 'Immaculate', 'Flawless', 'Noir',
  'Threads', 'Prestige', 'Excalibur', 'Silhouette', 'Instant', 'Zenith', 'Cornerstones', 'Eminence', 'Elite', 'Black', 'Finest',
  'Topps', 'Ultra', 'Hardcourt', 'Classic', 'Press Pass', 'SkyBox', 'Fleer', 'SP', 'Metal', 'Panini',
];

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const VOCAB = PRODUCT_VOCABULARY.map(name => ({ name, key: ` ${normalize(name)} ` }));

function firstProduct(haystack: string): string | null {
  for (const entry of VOCAB) if (haystack.includes(entry.key)) return entry.name;
  return null;
}

/**
 * The product a title names. Parallel names from the catalogue ("Silver Prizm") are masked first, so a parallel is
 * not counted as the product; if masking leaves nothing, the text as written is used.
 */
function parseProduct(title: string, parallelPhrases: string[]): string | null {
  const haystack = ` ${normalize(title)} `;
  const masked = parallelPhrases.reduce((text, phrase) => (text.includes(` ${phrase} `) ? text.split(` ${phrase} `).join('  ') : text), haystack);
  return (masked !== haystack ? firstProduct(masked) : null) ?? firstProduct(haystack);
}

function startYear(season: string): number {
  return Number(/\d{4}/.exec(season)?.[0] ?? NaN);
}

interface Row {
  id: string;
  title: string;
  player_name: string | null;
  review_reasons: string[] | null;
  match_reasons: string[] | null;
}

interface Group {
  season: string;
  product: string;
  listings: number;
  catalogueHasProduct: boolean;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = path.resolve(outIndex === -1 ? 'docs/accuracy/unmatched-frequency-001.csv' : args[outIndex + 1]!);

  // A listing can hold a row per classifier version; count one version only, or every reclassified listing counts twice.
  const versionIndex = args.indexOf('--version');
  const version = versionIndex === -1 ? JEV_CLASSIFIER_VERSION : args[versionIndex + 1]!;

  const db = getDb();
  try {
    const { rows } = await db.query<Row>(
      `select sp.id::text id, sp.title, pc.player_name, pc.review_reasons, pc.raw_signals->'matchReasons' as match_reasons
       from public.product_classifications pc
       join public.store_products sp on sp.id = pc.store_product_id
       join public.stores s on s.id = sp.store_id and s.is_active
       where pc.classifier_type = 'jev' and pc.classifier_version = $1 and pc.item_type = 'single_card' and pc.sport = 'basketball'
         and sp.is_active and sp.current_availability and pc.product_line is null`,
      [version]
    );
    const catalogue = await db.query<{ season: string; normalized_product_line: string }>(
      `select season, normalized_product_line from public.checklist_products where sport = 'basketball'`
    );
    const inCatalogue = (season: string, product: string): boolean => {
      const wanted = normalize(product);
      const seasonStart = startYear(season);
      // An explicit season ("2022-23") must match exactly. A bare calendar year ("2025") may be either the
      // season that starts that year or the one that ends in it.
      const isRange = /\d{4}\s*-\s*\d{2}/.test(season);
      const seasonMatches = (catalogueSeason: string): boolean =>
        isRange ? catalogueSeason === season : startYear(catalogueSeason) === seasonStart || startYear(catalogueSeason) === seasonStart - 1;
      return catalogue.rows.some(
        entry => seasonMatches(entry.season) &&
          (normalize(entry.normalized_product_line) === wanted || normalize(entry.normalized_product_line).endsWith(` ${wanted}`))
      );
    };

    const detail: string[][] = [['store_product_id', 'title', 'season', 'product', 'player', 'review_reasons', 'match_reasons']];
    const parallels = await db.query<{ normalized_name: string }>(
      `select distinct normalized_name from public.checklist_parallels where position(' ' in normalized_name) > 0`
    );
    const parallelPhrases = parallels.rows.map(row => normalize(row.normalized_name)).sort((a, b) => b.length - a.length);
    const groups = new Map<string, Group>();
    const unparsed = { total: 0, noYear: 0, noProduct: 0, neither: 0 };
    for (const row of rows) {
      const { season } = parseSeason(row.title);
      const product = parseProduct(row.title, parallelPhrases);
      if (!season || !product) {
        unparsed.total += 1;
        if (!season && !product) unparsed.neither += 1;
        else if (!season) unparsed.noYear += 1;
        else unparsed.noProduct += 1;
        continue;
      }
      const key = `${season}|${product}`;
      const group = groups.get(key) ?? { season, product, listings: 0, catalogueHasProduct: inCatalogue(season, product) };
      group.listings += 1;
      groups.set(key, group);
      if (group.catalogueHasProduct && startYear(season) >= 2019) {
        detail.push([row.id, row.title, season, product, row.player_name ?? '', (row.review_reasons ?? []).join(' ; '), (row.match_reasons ?? []).join(' ; ')]);
      }
    }

    const total = rows.length;
    const share = (count: number): string => ((count / total) * 100).toFixed(1);
    const sorted = [...groups.values()].sort((a, b) => b.listings - a.listings || a.season.localeCompare(b.season));
    const from2019 = sorted.filter(group => startYear(group.season) >= 2019);
    const before2019 = sorted.filter(group => startYear(group.season) < 2019);

    const header = ['view', 'rank', 'season', 'product', 'listings', 'share_of_unmatched_pct', 'catalogue_has_product'];
    const lines: string[][] = [header];
    const add = (view: string, list: Group[], limit?: number): void => {
      list.slice(0, limit).forEach((group, index) =>
        lines.push([view, String(index + 1), group.season, group.product, String(group.listings), share(group.listings), group.catalogueHasProduct ? 'yes' : 'no'])
      );
    };
    add('top30_overall', sorted, 30);
    add('from_2019', from2019);
    add('before_2019', before2019);
    lines.push(['unparsed', '1', '', 'no year and/or no product recognised', String(unparsed.total), share(unparsed.total), '']);
    lines.push(['unparsed_detail', '1', '', 'no year only', String(unparsed.noYear), share(unparsed.noYear), '']);
    lines.push(['unparsed_detail', '2', '', 'no product only', String(unparsed.noProduct), share(unparsed.noProduct), '']);
    lines.push(['unparsed_detail', '3', '', 'neither', String(unparsed.neither), share(unparsed.neither), '']);

    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, toCsv(lines), 'utf8');
    // Listings from 2019-20 on whose product is in the catalogue and which are still unmatched: why each one failed.
    const detailIndex = args.indexOf('--catalogued-detail');
    if (detailIndex !== -1) fs.writeFileSync(path.resolve(args[detailIndex + 1]!), toCsv(detail), 'utf8');

    const sum = (list: Group[]): number => list.reduce((acc, group) => acc + group.listings, 0);
    console.log(JSON.stringify({
      unmatchedTotal: total,
      parsed: sum(sorted),
      unparsed,
      from2019: { groups: from2019.length, listings: sum(from2019), inCatalogueAlready: sum(from2019.filter(g => g.catalogueHasProduct)) },
      before2019: { groups: before2019.length, listings: sum(before2019) },
    }, null, 2));
    console.log(`Wrote ${out}`);
  } finally {
    await closeDb();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
