import type { DbClient } from '../db';
import { normalizeCatalogueName } from '../catalogue/checklist-parser';

/**
 * In-memory view of the checklist catalogue, used to propose candidates for Jev to choose between.
 * Jev cannot read a name out of a title; it can only pick from options. This module produces the options.
 */

export interface CatalogueParallel {
  id: number;
  name: string;
  normalizedName: string;
  serialLimit: number | null;
}

export interface CatalogueCard {
  id: number;
  subsetId: number;
  playerId: number | null;
  cardNumber: string | null;
  playerName: string;
  normalizedPlayerName: string;
  isRookie: boolean;
}

export interface CatalogueSubset {
  id: number;
  productId: number;
  name: string;
  kind: string;
  parallels: CatalogueParallel[];
  cards: CatalogueCard[];
}

export interface CatalogueProduct {
  id: number;
  season: string;
  brand: string;
  productLine: string;
  /** Normalised phrases that identify this product line in a title, longest first. */
  aliases: string[];
  subsets: CatalogueSubset[];
}

export interface CataloguePlayer {
  name: string;
  normalizedName: string;
  playerId: number | null;
}

export interface CatalogueData {
  products: CatalogueProduct[];
}

const MAX_PLAYER_NAME_TOKENS = 5;
const MAX_PLAYER_CANDIDATES = 12;
const MAX_PRODUCT_CANDIDATES = 12;

// Words that look like a name in a tag but are not a person.
const NON_PERSON_TAG_PATTERN =
  /\b(raw|graded|rookie|rookies|single|singles|box|pack|case|nba|nfl|mlb|nrl|ufc|wwe|afl|mls|nhl|rugby|soccer|basketball|football|baseball|cards?|sports?|panini|topps|upper deck|donruss|prizm|select|mosaic|optic|hoops|chrome|supplies|sale|new|stock|collection|autograph|auto|numbered|serial|insert|parallel|limited|edition|brand|year|sport|grade|grader|ungraded)\b/i;
const TEAM_PATTERN =
  /\b(hawks|celtics|nets|hornets|bulls|cavaliers|mavericks|nuggets|pistons|warriors|rockets|pacers|clippers|lakers|grizzlies|heat|bucks|timberwolves|pelicans|knicks|thunder|magic|76ers|sixers|suns|trail blazers|blazers|kings|spurs|raptors|jazz|wizards|supersonics|super sonics|sonics|bullets|bobcats)\b/i;
// Capitalised words in a title that are never part of a person's name.
const NON_NAME_WORDS = new Set(
  `panini topps upper deck fleer skybox sky box donruss prizm prizms select mosaic optic hoops chrome bowman leaf score
   rookie rookies card cards rc base auto autograph autographs signature signatures patch relic jersey refractor
   silver gold blue red green purple orange pink black white yellow teal bronze ice wave holo shimmer nba basketball
   the of and vs variation parallel insert edition premium stock stadium club finest ultra metal universe draft picks
   certified contenders revolution chronicles origins flux phoenix court kings elite national treasures spectra
   psa bgs sgc graded mint raw sp ssp numbered checklist team set series collection limited authentic`
    .split(/\s+/)
    .filter(Boolean)
);
const MAX_NAME_SPANS = 14;

/**
 * Key used to match a name in a title against the catalogue. Leading initials are joined so "P.J. Tucker",
 * "PJ Tucker" and "P J Tucker" are one name.
 */
export function playerKey(name: string): string {
  const tokens = normalizeCatalogueName(name).split(' ').filter(Boolean);
  const joined: string[] = [];
  for (const token of tokens) {
    const previous = joined[joined.length - 1];
    if (token.length === 1 && joined.length === 1 && previous !== undefined && /^[a-z]{1,2}$/.test(previous)) {
      joined[0] = previous + token;
    } else {
      joined.push(token);
    }
  }
  return joined.join(' ');
}

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length]!;
}

function productAliases(productLine: string): string[] {
  const normalized = normalizeCatalogueName(productLine);
  const aliases = new Set<string>([normalized]);
  if (normalized.startsWith('donruss optic')) aliases.add(normalized.replace(/^donruss /, ''));
  if (normalized === 'hoops') aliases.add('nba hoops');
  if (normalized === 'topps') aliases.add('topps basketball');
  // Panini's 2021-22 Elite is sold as "Donruss Elite" by every other year and store.
  if (normalized === 'elite') aliases.add('donruss elite');
  // Stores write "Topps Chrome Cosmic" for the product Topps calls "Cosmic Chrome".
  if (normalized === 'cosmic chrome') aliases.add('chrome cosmic');
  return [...aliases].sort((a, b) => b.length - a.length);
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${phrase} `);
}


/** The seasons either side of a catalogue season: "2020-21" -> ["2019-20", "2021-22"]. */
export function adjacentSeasons(season: string): string[] {
  const start = Number(/\d{4}/.exec(season)?.[0]);
  if (!Number.isFinite(start)) return [];
  const label = (year: number): string => `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  return [label(start - 1), label(start + 1)];
}

export class CatalogueIndex {
  readonly products: CatalogueProduct[];
  private readonly playersByName = new Map<string, CataloguePlayer>();
  private readonly playersByEdgeToken = new Map<string, CataloguePlayer[]>();
  private readonly subsetsById = new Map<number, CatalogueSubset>();
  private readonly productsById = new Map<number, CatalogueProduct>();

  constructor(data: CatalogueData) {
    this.products = data.products;
    for (const product of this.products) {
      this.productsById.set(product.id, product);
      for (const subset of product.subsets) {
        this.subsetsById.set(subset.id, subset);
        for (const card of subset.cards) {
          // Multi-player cards ("A / B") are not a person; their names would never match a title cleanly.
          if (/[\/&]/.test(card.playerName) || card.normalizedPlayerName.split(' ').length < 2) continue;
          const key = playerKey(card.playerName);
          if (this.playersByName.has(key)) continue;
          const player = { name: card.playerName, normalizedName: card.normalizedPlayerName, playerId: card.playerId };
          this.playersByName.set(key, player);
          const tokens = key.split(' ');
          for (const edge of new Set([tokens[0]!, tokens[tokens.length - 1]!])) {
            const list = this.playersByEdgeToken.get(edge) ?? [];
            list.push(player);
            this.playersByEdgeToken.set(edge, list);
          }
        }
      }
    }
  }

  get playerCount(): number {
    return this.playersByName.size;
  }

  product(id: number): CatalogueProduct | undefined {
    return this.productsById.get(id);
  }

  subset(id: number): CatalogueSubset | undefined {
    return this.subsetsById.get(id);
  }

  /**
   * Catalogue players named in any of the texts, longest names first. Exact names come first; when a text
   * yields none, near-misses are offered too, because stores misspell names ("Colin Sexton", "Devon Booker").
   * These are only candidates: Jev decides whether one of them is the person on the card.
   */
  findPlayers(texts: string[]): CataloguePlayer[] {
    const found = new Map<string, CataloguePlayer>();
    for (const text of texts) {
      const tokens = normalizeCatalogueName(text).split(' ').filter(Boolean);
      const before = found.size;
      for (let size = Math.min(MAX_PLAYER_NAME_TOKENS, tokens.length); size >= 2; size--) {
        for (let start = 0; start + size <= tokens.length; start++) {
          const player = this.playersByName.get(playerKey(tokens.slice(start, start + size).join(' ')));
          if (player) found.set(player.normalizedName, player);
        }
      }
      if (found.size > before) continue;

      for (let size = 2; size <= 3; size++) {
        for (let start = 0; start + size <= tokens.length; start++) {
          const window = tokens.slice(start, start + size);
          const phrase = playerKey(window.join(' '));
          if (phrase.length < 8) continue;
          const limit = phrase.length >= 12 ? 2 : 1;
          const neighbours = new Set([
            ...(this.playersByEdgeToken.get(window[0]!) ?? []),
            ...(this.playersByEdgeToken.get(window[window.length - 1]!) ?? []),
          ]);
          for (const player of neighbours) {
            if (editDistance(phrase, playerKey(player.name), limit) <= limit) found.set(player.normalizedName, player);
          }
        }
      }
    }
    return [...found.values()]
      .sort((a, b) => b.normalizedName.length - a.normalizedName.length)
      .slice(0, MAX_PLAYER_CANDIDATES);
  }

  /** Products whose line is named in the text, restricted to the given seasons when the title states one. */
  findProducts(texts: string[], seasonCandidates: string[]): CatalogueProduct[] {
    const haystack = texts.map(normalizeCatalogueName).join(' | ');
    const matches: Array<{ product: CatalogueProduct; alias: string; aliasLength: number }> = [];

    for (const product of this.products) {
      if (seasonCandidates.length > 0 && !seasonCandidates.includes(product.season)) continue;
      const alias = product.aliases.find(candidate => containsPhrase(haystack, candidate));
      if (alias) matches.push({ product, alias, aliasLength: alias.length });
    }

    // "Donruss Optic" in a title also contains "Donruss". When one candidate's matched phrase sits inside
    // another's in the same season, the longer, more specific product is the one the title names.
    const specific = matches.filter(
      match =>
        !matches.some(
          other =>
            other !== match &&
            other.product.season === match.product.season &&
            other.aliasLength > match.aliasLength &&
            ` ${other.alias} `.includes(` ${match.alias} `)
        )
    );

    return specific
      .sort((a, b) => b.aliasLength - a.aliasLength || b.product.season.localeCompare(a.product.season))
      .slice(0, MAX_PRODUCT_CANDIDATES)
      .map(match => match.product);
  }

  /**
   * Cards in a product consistent with what the title states. A card number and a player together
   * usually identify one card; either alone narrows the subsets Jev has to choose between.
   */
  findCards(product: CatalogueProduct, cardNumber: string | null, playerName: string | null): CatalogueCard[] {
    const number = cardNumber?.toLowerCase() ?? null;
    const player = playerName ? playerKey(playerName) : null;
    const isPlayer = (card: CatalogueCard): boolean => playerKey(card.playerName) === player;
    const all = product.subsets.flatMap(subset => subset.cards);
    const byNumber = number ? all.filter(card => card.cardNumber?.toLowerCase() === number) : [];
    const byPlayer = player ? all.filter(isPlayer) : [];

    if (number && player) {
      const both = byNumber.filter(isPlayer);
      if (both.length > 0) return both;
      // The store's number or name is off; the player is the more trustworthy of the two.
      return byPlayer.length > 0 ? byPlayer : byNumber;
    }
    return number ? byNumber : byPlayer;
  }


  /**
   * Catalogue players whose full name is written, as a whole phrase, in the text. Longest names first.
   * Unlike findPlayers this offers no near-misses, so a single result can be accepted by rule.
   */
  findExactPlayers(text: string): CataloguePlayer[] {
    const tokens = normalizeCatalogueName(text).split(' ').filter(Boolean);
    const found = new Map<string, CataloguePlayer>();
    for (let size = Math.min(MAX_PLAYER_NAME_TOKENS, tokens.length); size >= 2; size--) {
      for (let start = 0; start + size <= tokens.length; start++) {
        const player = this.playersByName.get(playerKey(tokens.slice(start, start + size).join(' ')));
        if (player) found.set(player.normalizedName, player);
      }
    }
    // A longer name contains shorter ones ("Jaime Jaquez Jr" contains "Jaime Jaquez"); keep the longest.
    const names = [...found.values()].sort((a, b) => b.normalizedName.length - a.normalizedName.length);
    return names.filter(
      (player, index) => !names.slice(0, index).some(longer => longer.normalizedName.includes(player.normalizedName))
    );
  }

  /** Cards in the product where BOTH the card number and the player agree with the title. */
  findAgreeingCards(product: CatalogueProduct, cardNumber: string, playerName: string): CatalogueCard[] {
    const number = cardNumber.toLowerCase();
    const player = playerKey(playerName);
    return product.subsets
      .flatMap(subset => subset.cards)
      .filter(card => card.cardNumber?.toLowerCase() === number && playerKey(card.playerName) === player);
  }

  /** Every card of the player in the product, across subsets. */
  playerCards(product: CatalogueProduct, playerName: string): CatalogueCard[] {
    const player = playerKey(playerName);
    return product.subsets.flatMap(subset => subset.cards).filter(card => playerKey(card.playerName) === player);
  }

  /**
   * Parallels on offer for a subset. Sub-blocks of the base set ("Base - Rated Rookies") list no
   * parallels of their own in the checklist and share the base set's.
   */
  parallelsFor(subset: CatalogueSubset): CatalogueParallel[] {
    if (subset.parallels.length > 0) return subset.parallels;
    if (subset.kind !== 'base') return [];
    const product = this.productsById.get(subset.productId);
    const base = product?.subsets
      .filter(candidate => candidate.kind === 'base' && candidate.parallels.length > 0)
      .sort((a, b) => b.cards.length - a.cards.length)[0];
    return base?.parallels ?? [];
  }
}

/**
 * Runs of capitalised words in a title that could be a person's name, for players the catalogue does not
 * cover (older sets, unlicensed legends). Code proposes the spans; Jev picks the one that is a name.
 */
export function titleNameSpans(title: string): string[] {
  const tokens = title.replace(/[,;:()"/]/g, ' ').split(/\s+/).filter(Boolean);
  const isNameToken = (token: string): boolean =>
    /^[A-Z][A-Za-z'’.-]*$/.test(token) && !NON_NAME_WORDS.has(token.toLowerCase().replace(/[^a-z]/g, ''));

  const spans: string[] = [];
  for (let size = 2; size <= 3; size++) {
    for (let start = 0; start + size <= tokens.length; start++) {
      const window = tokens.slice(start, start + size);
      if (window.every(isNameToken)) spans.push(window.join(' '));
    }
  }
  return [...new Set(spans)].slice(0, MAX_NAME_SPANS);
}

/** Person-like names a store publishes as a tag or product type, for players the catalogue does not cover. */
export function storeProvidedNames(tags: string[], productType: string | null): string[] {
  const candidates = [...tags, productType ?? '']
    .map(value => value.replace(/^[A-Za-z]+_/, '').trim())
    .filter(value => /^[A-Z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]*){1,3}$/.test(value))
    .filter(value => !NON_PERSON_TAG_PATTERN.test(value) && !TEAM_PATTERN.test(value));
  return [...new Set(candidates)].slice(0, 4);
}

export async function loadCatalogueIndex(db: DbClient): Promise<CatalogueIndex> {
  const [products, subsets, parallels, cards] = await Promise.all([
    db.query<{ id: string; season: string; brand: string; product_line: string }>(
      `select id, season, brand, product_line from public.checklist_products where sport = 'basketball'`
    ),
    db.query<{ id: string; product_id: string; name: string; kind: string }>(
      `select id, product_id, name, kind from public.checklist_subsets`
    ),
    db.query<{ id: string; subset_id: string; name: string; normalized_name: string; serial_limit: number | null }>(
      `select id, subset_id, name, normalized_name, serial_limit from public.checklist_parallels`
    ),
    db.query<{
      id: string;
      subset_id: string;
      player_id: string | null;
      card_number: string | null;
      player_name: string;
      normalized_player_name: string;
      is_rookie: boolean;
    }>(
      `select id, subset_id, player_id, card_number, player_name, normalized_player_name, is_rookie
       from public.checklist_cards`
    ),
  ]);

  const subsetMap = new Map<number, CatalogueSubset>();
  for (const row of subsets.rows) {
    subsetMap.set(Number(row.id), {
      id: Number(row.id),
      productId: Number(row.product_id),
      name: row.name,
      kind: row.kind,
      parallels: [],
      cards: [],
    });
  }
  for (const row of parallels.rows) {
    subsetMap.get(Number(row.subset_id))?.parallels.push({
      id: Number(row.id),
      name: row.name,
      normalizedName: row.normalized_name,
      serialLimit: row.serial_limit,
    });
  }
  for (const row of cards.rows) {
    subsetMap.get(Number(row.subset_id))?.cards.push({
      id: Number(row.id),
      subsetId: Number(row.subset_id),
      playerId: row.player_id === null ? null : Number(row.player_id),
      cardNumber: row.card_number,
      playerName: row.player_name,
      normalizedPlayerName: row.normalized_player_name,
      isRookie: row.is_rookie,
    });
  }

  const subsetsByProduct = new Map<number, CatalogueSubset[]>();
  for (const subset of subsetMap.values()) {
    const list = subsetsByProduct.get(subset.productId) ?? [];
    list.push(subset);
    subsetsByProduct.set(subset.productId, list);
  }

  return new CatalogueIndex({
    products: products.rows.map(row => ({
      id: Number(row.id),
      season: row.season,
      brand: row.brand,
      productLine: row.product_line,
      aliases: productAliases(row.product_line),
      subsets: subsetsByProduct.get(Number(row.id)) ?? [],
    })),
  });
}

export { productAliases };
