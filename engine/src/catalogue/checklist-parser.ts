/**
 * Parses Beckett-format set checklists (one workbook per product) into product -> subset -> cards + parallels.
 *
 * Each subset sheet (Base, Autographs, Memorabilia, Inserts) is a run of blocks:
 *
 *   Color Blast                 <- subset name, alone on its row
 *   18 cards                    <- card count
 *   Parallels                   <- optional
 *   Red Prizms /299             <- one parallel per row, print run after the slash
 *   1  Victor Wembanyama  San Antonio Spurs   <- card rows
 *
 * The parser is pure: it takes sheet rows, so it can be tested without spreadsheet files.
 */

export type SheetRow = Array<string | number | null | undefined>;

export type SubsetKind = 'base' | 'insert' | 'autograph' | 'memorabilia' | 'other';

export interface ChecklistParallel {
  name: string;
  serialLimit: number | null;
  note: string | null;
}

export interface ChecklistCard {
  cardNumber: string | null;
  playerName: string;
  teamName: string | null;
  isRookie: boolean;
  serialLimit: number | null;
}

export interface ChecklistSubset {
  name: string;
  kind: SubsetKind;
  declaredCardCount: number | null;
  parallels: ChecklistParallel[];
  cards: ChecklistCard[];
  /**
   * Set when this subset is a numbered block of a base set ("Crusade - #516-545"): the name of the base set it
   * belongs to. Blocks keep their own cards, and their own parallels when the sheet lists some.
   */
  parentName?: string | null;
  numberFrom?: number | null;
  numberTo?: number | null;
}

/** What the parser understood on one sheet, so an import can prove nothing was silently dropped. */
export interface SheetTrace {
  sheet: string;
  /** Subsets opened by a header row. */
  subsetHeaders: string[];
  /** Blocks declared by a "Name - #from-to" row. */
  blocks: Array<{ name: string; from: number; to: number; parent: string; implicit: boolean }>;
  /** Parallel names read, as "owner | name" where owner is the subset or block they were listed under. */
  parallelNames: string[];
  /** Rows that look like a numbered card (a card number then a name), counted without the parser. */
  numberedCardRows: number;
  /** Cards the parser produced from numbered rows. */
  numberedCardsParsed: number;
  cardsParsed: number;
  /** Single-cell rows recognised as odds or notes (ignored on purpose). */
  notes: string[];
  /** Rows the parser could not place anywhere. */
  unplaced: string[];
  /** Exact repeats of a card row (same number, player, team and print run) within one subset, dropped. */
  duplicatesRemoved: number;
}

export interface ChecklistProduct {
  season: string;
  brand: string;
  productLine: string;
  sourceFile: string;
}

const SKIPPED_SHEET_PATTERN = /master|team|full checklist|update/i;
const COUNT_ROW_PATTERN = /^\d[\d,]*\s+cards?\b/i;
const PARALLELS_HEADER_PATTERN = /^parallels?\s*:?$/i;
// Card numbers are short codes with no spaces: 12, 80B2-AD, RS-DOT, PH12.
const CARD_NUMBER_PATTERN = /^#?[A-Za-z0-9]{1,8}(?:[-.][A-Za-z0-9]{1,8}){0,3}$/;

function cells(row: SheetRow): string[] {
  return row
    .map(cell => (cell === null || cell === undefined ? '' : String(cell).replace(/\s+/g, ' ').trim()))
    .filter(cell => cell !== '');
}

export function sheetKind(sheetName: string): SubsetKind {
  if (/auto/i.test(sheetName)) return 'autograph';
  if (/memorabilia|relic/i.test(sheetName)) return 'memorabilia';
  if (/insert/i.test(sheetName)) return 'insert';
  if (/base/i.test(sheetName)) return 'base';
  return 'other';
}

export function isSubsetSheet(sheetName: string): boolean {
  return !SKIPPED_SHEET_PATTERN.test(sheetName);
}

/** "2023-24-Panini-NBA-Hoops-Basketball-Checklist.xlsx" -> { season: "2023-24", brand: "Panini", productLine: "Hoops" } */
export function productFromFileName(fileName: string): ChecklistProduct | null {
  const base = fileName.replace(/\.xlsx$/i, '').replace(/\(\d+\)$/, '');
  const match = base.match(/^(\d{4}(?:-\d{2})?)-(.+?)-Basketball(?:-Checklist)?$/i);
  if (!match) return null;

  const season = match[1]!;
  const tokens = match[2]!.split('-').filter(Boolean);
  const first = tokens[0] ?? '';
  let brand = 'Panini';
  let lineTokens = tokens;

  if (first === 'Topps') {
    brand = first;
    // The flagship set is just "Topps"; everything else drops the brand prefix ("Topps Chrome Sapphire" -> "Chrome Sapphire").
    lineTokens = tokens.length > 1 ? tokens.slice(1) : tokens;
  } else if (first === 'Bowman') {
    // Bowman keeps its name in the product line, so "Bowman Chrome" stays distinct from Topps "Chrome".
    brand = 'Topps';
  } else if (first === 'Panini') {
    lineTokens = tokens.slice(1);
  }

  const productLine = lineTokens.join(' ').replace(/^NBA\s+/i, '').trim();
  if (!productLine) return null;
  return { season, brand, productLine, sourceFile: fileName };
}

export function parseParallelLine(line: string): ChecklistParallel | null {
  let text = line.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  let note: string | null = null;
  const parenthetical = text.match(/\(([^)]*)\)\s*$/);
  if (parenthetical) {
    note = parenthetical[1]!.trim() || null;
    text = text.slice(0, parenthetical.index).trim();
  }

  let serialLimit: number | null = null;
  const serial = text.match(/(?:\b1\s*\/\s*1\b|#?\s*\/\s*(\d[\d,]*))\s*$/i) ?? text.match(/#?\s*\/\s*(\d[\d,]*)/);
  if (serial) {
    serialLimit = serial[1] ? Number(serial[1].replace(/,/g, '')) : 1;
    text = (text.slice(0, serial.index) + text.slice((serial.index ?? 0) + serial[0].length)).trim();
  } else if (/\b(one[-\s]of[-\s]one|1[-\s]of[-\s]1)\b/i.test(text)) {
    serialLimit = 1;
    text = text.replace(/\b(one[-\s]of[-\s]one|1[-\s]of[-\s]1)\b/i, '').trim();
  }

  // "Green Ice Prizms - select cards only, list below": the remark is a note, not part of the name.
  const remark = text.match(/\s+[-–]\s+((?:select cards only|only on select cards|list below)[^]*)$/i);
  if (remark) {
    note = note ?? remark[1]!.trim();
    text = text.slice(0, remark.index).trim();
  }

  const name = text.replace(/[\s\-–—:,#]+$/g, '').trim();
  if (!name) return null;
  return { name, serialLimit, note };
}

function parseCardRow(row: string[]): ChecklistCard | null {
  if (row.length < 2) return null;

  const hasNumber = CARD_NUMBER_PATTERN.test(row[0]!) && /\d/.test(row[0]!) ? true : CARD_NUMBER_PATTERN.test(row[0]!) && row.length >= 3;
  const cardNumber = hasNumber ? row[0]!.replace(/^#/, '') : null;
  const rest = hasNumber ? row.slice(1) : row;
  const playerName = (rest[0] ?? '').replace(/[,\s]+$/g, '').trim();
  if (!playerName || !/[A-Za-z]/.test(playerName)) return null;

  const extras = rest.slice(1).filter(cell => cell !== ',');
  const teamName = extras.find(cell => /[A-Za-z]{3}/.test(cell) && !/^[-–]?\s*(rookies?|rc)\b/i.test(cell) && !/^\//.test(cell)) ?? null;
  const trailing = extras.filter(cell => cell !== teamName).join(' ');
  const serial = trailing.match(/\/\s*(\d[\d,]*)/);

  return {
    cardNumber,
    playerName,
    teamName: teamName ? teamName.replace(/[,\s]+$/g, '').trim() : null,
    isRookie: /\b(rookies?|rc)\b/i.test(trailing),
    serialLimit: serial ? Number(serial[1]!.replace(/,/g, '')) : null,
  };
}

function subsetName(header: string): string {
  return header.replace(/\s+checklist$/i, '').replace(/\s+/g, ' ').trim();
}

// "Crusade - #516-545", "Base - #1-200": a numbered block of a base set. Numbers only; lettered ranges are not blocks.
const BLOCK_DEFINITION_PATTERN = /^(.{2,60}?)\s*(?:[-–]\s*#?|:\s*#s?)\s*(\d+)\s*[-–]\s*#?\s*(\d+)$/;
// Odds, pack notes and similar single-cell rows that carry no checklist information.
const NOTE_PATTERN = /\b\d+\s*:\s*\d+\b|\bodds?\b|\bpacks?\b|\bnotes?\b|\bavailable\b|\bexclusive\b|\bcards? (?:per|in)\b|\bcontinues\b|\bonly\.?$|\bper (?:\w+ )?(?:box|case|premium)\b|^\d+ (?:per|in) /i;
// "Parallels:", "Electric Etch Parallels:", "Parallels (#1-67 only):", "Versions:": a heading that introduces a list of parallels.
const PARALLELS_INTRO_PATTERN = /^(?:paralle?s|parallels?|versions?|variations?)\s*:?$|^.{0,40}\b(?:parallels?|versions?)\b[^:]{0,30}:$/i;

/** Block names are compared loosely: "Plates & Patches" is "Plates and Patches", "Rookies" is "Rookie". */
function blockKey(name: string): string {
  return normalizeCatalogueName(name.replace(/&/g, ' and '))
    .split(' ')
    .filter(word => word !== 'and')
    .join(' ')
    .replace(/s$/, '');
}

/** A heading names a block when the names are equal or one ends with the other ("Rookies I" and "I"). */
function sameBlock(a: string, b: string): boolean {
  const x = blockKey(a);
  const y = blockKey(b);
  return x === y || x.endsWith(` ${y}`) || y.endsWith(` ${x}`);
}

interface WorkingSubset extends ChecklistSubset {
  blocks: WorkingSubset[];
  /** A block that has no "#from-to" definition: a heading inside a set whose "N cards" total is larger than its first section. */
  implicit: boolean;
  /** A heading with no count row whose sections follow ("Road to the Finals" > "First Round", "Second Round"). */
  group: boolean;
}

function newSubset(name: string, kind: SubsetKind, implicit = false): WorkingSubset {
  return { name, kind, declaredCardCount: null, parallels: [], cards: [], parentName: null, numberFrom: null, numberTo: null, blocks: [], implicit, group: false };
}

function looksNumbered(row: string[]): boolean {
  return row.length >= 2 && CARD_NUMBER_PATTERN.test(row[0]!) && /\d/.test(row[0]!) && /[A-Za-z]{2}/.test(row[1]!) && !COUNT_ROW_PATTERN.test(row[0]!);
}

function totalCards(subset: WorkingSubset): number {
  return subset.cards.length + subset.blocks.reduce((sum, block) => sum + block.cards.length, 0);
}

export function parseSubsetSheetDetailed(sheetName: string, rows: SheetRow[]): { subsets: ChecklistSubset[]; trace: SheetTrace } {
  const kind = sheetKind(sheetName);
  const items = rows.map(cells).filter(line => line.length > 0);
  const tops: WorkingSubset[] = [];
  const trace: SheetTrace = {
    sheet: sheetName,
    subsetHeaders: [],
    blocks: [],
    parallelNames: [],
    numberedCardRows: 0,
    numberedCardsParsed: 0,
    cardsParsed: 0,
    notes: [],
    unplaced: [],
    duplicatesRemoved: 0,
  };

  let top: WorkingSubset | null = null;
  let active: WorkingSubset | null = null; // where the next parallels and cards go
  let inParallels = false;
  let cardsSinceHeading = 0;
  let cardsInTop = 0;

  const open = (name: string): void => {
    const created = newSubset(subsetName(name), kind);
    top = created;
    tops.push(created);
    active = created;
    inParallels = false;
    cardsSinceHeading = 0;
    cardsInTop = 0;
    trace.subsetHeaders.push(created.name);
  };

  for (let index = 0; index < items.length; index++) {
    const line = items[index]!;
    const next = items[index + 1] ?? null;
    const currentTop = top as WorkingSubset | null;
    const currentActive = active as WorkingSubset | null;

    if (line.length === 1) {
      const text = line[0]!;

      if (COUNT_ROW_PATTERN.test(text)) {
        if (currentTop && cardsInTop === 0 && currentTop.declaredCardCount === null) {
          currentTop.declaredCardCount = Number(text.match(/^\d[\d,]*/)![0].replace(/,/g, ''));
        } else {
          trace.notes.push(text);
        }
        continue;
      }
      if (PARALLELS_INTRO_PATTERN.test(text)) {
        inParallels = true;
        cardsSinceHeading = 0;
        continue;
      }

      const block = BLOCK_DEFINITION_PATTERN.exec(text);
      if (block && currentTop && !(next && next.length === 1 && COUNT_ROW_PATTERN.test(next[0]!))) {
        const definition = newSubset(subsetName(block[1]!), kind);
        definition.parentName = currentTop.name;
        definition.numberFrom = Number(block[2]);
        definition.numberTo = Number(block[3]);
        currentTop.blocks.push(definition);
        trace.blocks.push({ name: definition.name, from: definition.numberFrom, to: definition.numberTo, parent: currentTop.name, implicit: false });
        continue;
      }

      // Some sheets list parallels straight after the "N cards" row, with no "Parallels:" heading.
      const headerlessParallels =
        !inParallels && currentActive !== null && currentActive === currentTop && cardsInTop === 0 && currentTop !== null && currentTop.blocks.length === 0 &&
        !NOTE_PATTERN.test(text) && !/:$/.test(text) && parseParallelLine(text) !== null &&
        // A list has more than one entry. A lone line followed by "Parallels:" or by cards is a heading.
        next !== null && next.length === 1 && !COUNT_ROW_PATTERN.test(next[0]!) && !PARALLELS_INTRO_PATTERN.test(next[0]!) &&
        !BLOCK_DEFINITION_PATTERN.test(next[0]!);
      if (headerlessParallels) inParallels = true;
      const parallelEntry = inParallels && cardsSinceHeading === 0 && currentActive !== null;
      const nextIsCount = next !== null && next.length === 1 && COUNT_ROW_PATTERN.test(next[0]!);
      const nextIsParallels = next !== null && next.length === 1 && PARALLELS_INTRO_PATTERN.test(next[0]!);
      const nextIsCard = next !== null && next.length >= 2 && parseCardRow(next) !== null;
      const nextIsBlockDefinition = next !== null && next.length === 1 && BLOCK_DEFINITION_PATTERN.test(next[0]!);
      const afterNext = items[index + 2] ?? null;
      const nextIsSectionHeading =
        next !== null && next.length === 1 && !COUNT_ROW_PATTERN.test(next[0]!) && !PARALLELS_INTRO_PATTERN.test(next[0]!) &&
        !NOTE_PATTERN.test(next[0]!) && !/:$/.test(next[0]!) && !BLOCK_DEFINITION_PATTERN.test(next[0]!) &&
        afterNext !== null && ((afterNext.length >= 2 && parseCardRow(afterNext) !== null) || (afterNext.length === 1 && PARALLELS_INTRO_PATTERN.test(afterNext[0]!)));
      const note = NOTE_PATTERN.test(text) || /:$/.test(text);

      if (nextIsCount) {
        open(text);
        continue;
      }
      if (!parallelEntry && !note && nextIsSectionHeading && !(currentTop && currentTop.group)) {
        open(text);
        (top as WorkingSubset | null)!.group = true;
        continue;
      }
      // The first block's heading can come straight after a parallels list ("Veterans" before the cards):
      // an exact repeat of a declared block's name ends the list.
      if (parallelEntry && currentTop?.blocks.some(candidate => !candidate.implicit && blockKey(candidate.name) === blockKey(subsetName(text)))) {
        active = currentTop.blocks.find(candidate => !candidate.implicit && blockKey(candidate.name) === blockKey(subsetName(text)))!;
        inParallels = false;
        cardsSinceHeading = 0;
        continue;
      }
      if (!parallelEntry) {
        // A heading that repeats a declared block's name: the cards and parallels that follow belong to it.
        const key = blockKey(subsetName(text));
        const named = currentTop?.blocks.find(candidate => !candidate.implicit && sameBlock(candidate.name, key));
        if (named) {
          active = named;
          inParallels = false;
          cardsSinceHeading = 0;
          continue;
        }
        // A header need not be followed by an "N cards" row: "Parallels:" or the first card is enough.
        const startsSection = !note && (nextIsParallels || nextIsBlockDefinition || (nextIsCard && (currentTop === null || cardsInTop > 0 || currentTop.blocks.length === 0)));
        if (startsSection) {
          // Inside a set whose "N cards" total is not yet reached, a new heading is a block of that set
          // ("Veterans", "Rookies I", "Rookie Ticket"), not a set of its own.
          if (currentTop && (currentTop.group || (currentTop.declaredCardCount !== null && totalCards(currentTop) < currentTop.declaredCardCount))) {
            const implicit = newSubset(subsetName(text), kind, true);
            implicit.parentName = currentTop.name;
            currentTop.blocks.push(implicit);
            trace.blocks.push({ name: implicit.name, from: 0, to: 0, parent: currentTop.name, implicit: true });
            active = implicit;
            inParallels = false;
            cardsSinceHeading = 0;
          } else {
            open(text);
          }
          continue;
        }
      }
      if (parallelEntry) {
        const parallel = parseParallelLine(text);
        if (parallel) {
          currentActive!.parallels.push(parallel);
          trace.parallelNames.push(`${currentActive!.name} | ${parallel.name}`);
          continue;
        }
      }
      if (note) trace.notes.push(text);
      else trace.unplaced.push(text);
      continue;
    }

    // A row with several cells: a card, or something we cannot place.
    const numbered = looksNumbered(line);
    if (numbered) trace.numberedCardRows += 1;
    const card = parseCardRow(line);
    if (!card || !currentTop) {
      trace.unplaced.push(line.join(' | '));
      continue;
    }
    const number = /^\d+$/.test(card.cardNumber ?? '') ? Number(card.cardNumber) : null;
    const byRange =
      number === null ? undefined : currentTop.blocks.find(candidate => !candidate.implicit && number >= candidate.numberFrom! && number <= candidate.numberTo!);
    const target: WorkingSubset = byRange ?? (currentActive && currentActive !== currentTop && currentTop.blocks.includes(currentActive) ? currentActive : currentTop);
    target.cards.push(card);
    cardsInTop += 1;
    cardsSinceHeading += 1;
    trace.cardsParsed += 1;
    if (numbered) trace.numberedCardsParsed += 1;
    inParallels = false;
  }

  const dedupe = (subset: WorkingSubset): void => {
    const seen = new Set<string>();
    const kept: ChecklistCard[] = [];
    for (const card of subset.cards) {
      const key = `${card.cardNumber}|${normalizeCatalogueName(card.playerName)}|${card.teamName ?? ''}|${card.serialLimit ?? ''}`;
      if (seen.has(key)) {
        trace.duplicatesRemoved += 1;
        continue;
      }
      seen.add(key);
      kept.push(card);
    }
    subset.cards = kept;
  };
  for (const parent of tops) {
    dedupe(parent);
    parent.blocks.forEach(dedupe);
  }

  // "Legends - #226-250" declared under "Base Set" may be listed as its own set further down ("Base - Legends").
  // That set is the block: it takes the declared range and the base set becomes its parent.
  for (const parent of tops) {
    for (const block of parent.blocks.filter(candidate => !candidate.implicit && candidate.cards.length === 0)) {
      const wanted = blockKey(block.name.replace(/^base\b[\s-]*/i, ''));
      const sibling = tops.find(candidate => candidate !== parent && candidate.blocks.length === 0 && blockKey(candidate.name.replace(/^base\b[\s-]*/i, '')) === wanted);
      if (!sibling) continue;
      block.cards = sibling.cards;
      block.parallels = [...block.parallels, ...sibling.parallels];
      block.declaredCardCount = sibling.declaredCardCount;
      tops.splice(tops.indexOf(sibling), 1);
      trace.subsetHeaders = trace.subsetHeaders.filter(name => name !== sibling.name);
      trace.parallelNames = trace.parallelNames.map(entry => (entry.startsWith(`${sibling.name} | `) ? `${block.name} | ${entry.slice(sibling.name.length + 3)}` : entry));
    }
  }

  const subsets: ChecklistSubset[] = [];
  for (const parent of tops) {
    for (const block of parent.blocks) {
      // A block named for rookies makes its cards rookies, whether or not each row says "RC".
      if (/rookie/i.test(block.name)) for (const card of block.cards) card.isRookie = true;
      if (block.implicit) {
        const numbers = block.cards.map(card => (/^\d+$/.test(card.cardNumber ?? '') ? Number(card.cardNumber) : NaN)).filter(Number.isFinite);
        if (numbers.length > 0) {
          block.numberFrom = Math.min(...numbers);
          block.numberTo = Math.max(...numbers);
        }
        const traced = trace.blocks.find(entry => entry.implicit && entry.parent === parent.name && entry.name === block.name);
        if (traced) {
          traced.from = block.numberFrom ?? 0;
          traced.to = block.numberTo ?? 0;
        }
      }
    }
    const withContent = parent.blocks.filter(block => block.cards.length > 0 || block.parallels.length > 0);
    if (parent.cards.length > 0 || parent.parallels.length > 0 || withContent.length > 0) {
      const { blocks: _blocks, implicit: _implicit, group: _group, ...parentOnly } = parent;
      subsets.push(parentOnly);
    }
    for (const block of withContent) {
      const { blocks: _unused, implicit: _flag, group: _g, ...blockOnly } = block;
      subsets.push(blockOnly);
    }
  }
  return { subsets, trace };
}

export function parseSubsetSheet(sheetName: string, rows: SheetRow[]): ChecklistSubset[] {
  return parseSubsetSheetDetailed(sheetName, rows).subsets;
}

export function normalizeCatalogueName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
