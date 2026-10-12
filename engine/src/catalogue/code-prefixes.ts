import fs from 'node:fs';
import { closeDb, getDb } from '../db';
import { toCsv } from '../accuracy/csv';
import { loadCatalogueIndex, type CatalogueSubset } from '../classify/catalogue-index';
import { titleNamesSubset } from '../classify/classifier';
import { parseCardNumber, parseSeason } from '../classify/title-fields';
import { normalizeCatalogueName } from './checklist-parser';
import { loadCodePrefixEntries, sourceCodePrefix, type CodePrefixEntry } from './import-checklists';

/**
 * Subset code prefixes (CAR-93): "AM" for Alumni Mates, so a store's "AM-9" can be compared with number 9.
 *
 *   derive  reads live store titles and proposes a prefix for each insert subset where the codes are consistent.
 *           Writes docs/catalogue/code-prefixes-derived-disabled.json and docs/catalogue/code-prefixes-review.csv
 *           (the evidence). Changes nothing in the database, and nothing here is used by the matcher.
 *   apply   writes prefixes to checklist_subsets from the source checklist, where its card numbers carry the prefix.
 *           Derived prefixes are disabled and never applied.
 *
 * Usage: npx tsx --env-file=web/.env.local engine/src/catalogue/code-prefixes.ts derive|apply [--dry-run]
 */

// Derived prefixes are proposals only and are NOT applied (disabled 2026-10-12): they go to a separate file.
const FILE = 'docs/catalogue/code-prefixes-derived-disabled.json';
const REVIEW = 'docs/catalogue/code-prefixes-review.csv';
const MIN_LISTINGS = 2;
const MIN_SHARE = 0.9;

interface Evidence {
  prefix: string;
  title: string;
  store: string;
}

async function derive(): Promise<void> {
  const db = getDb();
  const catalogue = await loadCatalogueIndex(db);
  const { rows } = await db.query<{ title: string; store: string }>(
    `select sp.title, coalesce(st.name, sp.source) as store
     from public.store_products sp join public.stores st on st.id = sp.store_id and st.is_active
     where sp.is_active and sp.current_availability`
  );

  const bySubset = new Map<number, { product: string; subset: CatalogueSubset; evidence: Evidence[] }>();
  for (const row of rows) {
    const number = parseCardNumber(row.title);
    const match = number ? /^([A-Za-z]{1,5})-(.+)$/.exec(number) : null;
    if (!number || !match) continue;
    const prefix = match[1]!.toUpperCase();
    const tail = match[2]!;
    const { seasonCandidates } = parseSeason(row.title);
    const players = catalogue.findExactPlayers(row.title);
    for (const product of catalogue.findProducts([row.title], seasonCandidates)) {
      for (const player of players) {
        for (const subset of product.subsets) {
          if (subset.kind === 'base') continue;
          const playerCards = subset.cards.filter(card => card.normalizedPlayerName === player.normalizedName);
          if (playerCards.length === 0) continue;
          // The title names this subset, or the numeric tail is exactly this player's number in it.
          const numericTail = /^\d+$/.test(tail) && playerCards.some(card => card.cardNumber !== null && String(Number(tail)) === card.cardNumber);
          if (!titleNamesSubset(row.title, subset.name) && !numericTail) continue;
          const entry = bySubset.get(subset.id) ?? { product: `${product.season}|${product.productLine}`, subset, evidence: [] };
          entry.evidence.push({ prefix, title: row.title, store: row.store });
          bySubset.set(subset.id, entry);
        }
      }
    }
  }

  const entries: CodePrefixEntry[] = [];
  const review: string[][] = [['season', 'product', 'subset', 'prefix', 'listings', 'stores', 'share_pct', 'decision', 'example_titles']];
  const used = new Map<string, number>(); // product|prefix -> subsets, to refuse a prefix two subsets would share
  const proposals: Array<{ key: string; entry: CodePrefixEntry; row: string[] }> = [];
  for (const { product, subset, evidence } of bySubset.values()) {
    const counts = new Map<string, Evidence[]>();
    for (const item of evidence) counts.set(item.prefix, [...(counts.get(item.prefix) ?? []), item]);
    const [prefix, top] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
    const share = top.length / evidence.length;
    const stores = new Set(top.map(item => item.store)).size;
    const [season, productLine] = product.split('|') as [string, string];
    const fromSource = sourceCodePrefix(subset.cards.map(card => card.cardNumber));
    // One listing is enough only when the prefix is also the initials of the subset's name (two independent signals).
    const initials = normalizeCatalogueName(subset.name).split(' ').filter(Boolean).map(word => word[0]!.toUpperCase()).join('');
    const corroborated = top.length >= 1 && prefix === initials;
    const decision = fromSource
      ? 'already in the source'
      : share < MIN_SHARE
        ? 'codes disagree'
        : top.length >= MIN_LISTINGS || corroborated
          ? 'proposed'
          : 'too few listings';
    const row = [season, productLine, subset.name, prefix, String(top.length), String(stores), (share * 100).toFixed(0), decision, [...new Set(top.map(item => item.title))].slice(0, 3).join(' ; ')];
    if (decision === 'proposed') {
      const key = `${product}|${prefix}`;
      used.set(key, (used.get(key) ?? 0) + 1);
      proposals.push({ key, entry: { season, productLine, subset: subset.name, prefix, source: 'store_codes' }, row });
    } else review.push(row);
  }
  for (const proposal of proposals) {
    if ((used.get(proposal.key) ?? 0) > 1) {
      proposal.row[7] = 'prefix shared by several subsets';
      review.push(proposal.row);
    } else {
      entries.push(proposal.entry);
      review.push(proposal.row);
    }
  }

  entries.sort((a, b) => `${a.season}${a.productLine}${a.subset}`.localeCompare(`${b.season}${b.productLine}${b.subset}`));
  fs.writeFileSync(
    FILE,
    JSON.stringify(
      {
        status: 'PENDING review by Harry. Derived from consistent codes in live store titles (see code-prefixes-review.csv). A prefix only lets "PREFIX-n" match number n of that subset, for a player who has a card in it.',
        entries,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  fs.writeFileSync(REVIEW, toCsv(review), 'utf8');
  console.log(`${bySubset.size} subsets seen in store codes; ${entries.length} prefixes proposed. Wrote ${FILE} and ${REVIEW}`);
  await closeDb();
}

async function apply(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const db = getDb();
  const entries = loadCodePrefixEntries();
  const subsets = await db.query<{ id: string; season: string; product_line: string; name: string; numbers: Array<string | null> }>(
    `select s.id, cp.season, cp.product_line, s.name, array_agg(c.card_number) as numbers
     from public.checklist_subsets s
     join public.checklist_products cp on cp.id = s.product_id
     left join public.checklist_cards c on c.subset_id = s.id
     group by s.id, cp.season, cp.product_line, s.name`
  );
  const updates: Array<{ id: number; prefix: string; source: string }> = [];
  for (const subset of subsets.rows) {
    const fromSource = sourceCodePrefix(subset.numbers);
    const listed = entries.find(
      entry => entry.season === subset.season && normalizeCatalogueName(entry.productLine) === normalizeCatalogueName(subset.product_line) && normalizeCatalogueName(entry.subset) === normalizeCatalogueName(subset.name)
    );
    if (fromSource) updates.push({ id: Number(subset.id), prefix: fromSource, source: 'source' });
    else if (listed) updates.push({ id: Number(listed ? subset.id : 0), prefix: listed.prefix.toUpperCase(), source: listed.source });
  }
  console.log(`${updates.filter(u => u.source === 'source').length} prefixes from the source checklists, ${updates.filter(u => u.source === 'store_codes').length} from the reviewed list.`);
  if (!dryRun && updates.length > 0) {
    await db.query(
      `update public.checklist_subsets s set code_prefix = u.prefix, code_prefix_source = u.source
       from jsonb_to_recordset($1::jsonb) as u(id bigint, prefix text, source text) where s.id = u.id`,
      [JSON.stringify(updates)]
    );
    console.log(`Updated ${updates.length} subsets.`);
  }
  await closeDb();
}

const command = process.argv[2];
(command === 'derive' ? derive() : command === 'apply' ? apply() : Promise.reject(new Error('usage: code-prefixes.ts derive|apply [--dry-run]'))).catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
