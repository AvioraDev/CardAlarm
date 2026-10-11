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

export function parseSubsetSheet(sheetName: string, rows: SheetRow[]): ChecklistSubset[] {
  const kind = sheetKind(sheetName);
  const lines = rows.map(cells);
  const subsets: ChecklistSubset[] = [];
  let current: ChecklistSubset | null = null;
  let inParallels = false;

  const nextContentLine = (from: number): string[] | null => {
    for (let index = from; index < lines.length; index++) {
      if (lines[index]!.length > 0) return lines[index]!;
    }
    return null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.length === 0) continue;

    if (line.length === 1) {
      const text = line[0]!;
      const next = nextContentLine(index + 1);
      const startsSubset = next !== null && next.length === 1 && COUNT_ROW_PATTERN.test(next[0]!);

      if (startsSubset) {
        current = { name: subsetName(text), kind, declaredCardCount: null, parallels: [], cards: [] };
        subsets.push(current);
        inParallels = false;
        continue;
      }
      if (!current) continue;

      if (COUNT_ROW_PATTERN.test(text) && current.cards.length === 0 && current.declaredCardCount === null) {
        current.declaredCardCount = Number(text.match(/^\d[\d,]*/)![0].replace(/,/g, ''));
        continue;
      }
      if (PARALLELS_HEADER_PATTERN.test(text)) {
        inParallels = true;
        continue;
      }
      // Single-cell rows outside a parallels list are odds, notes or descriptions ("1:11 packs").
      if (inParallels && current.cards.length === 0) {
        const parallel = parseParallelLine(text);
        if (parallel) current.parallels.push(parallel);
      }
      continue;
    }

    if (!current) continue;
    const card = parseCardRow(line);
    if (card) {
      current.cards.push(card);
      inParallels = false;
    }
  }

  return subsets.filter(subset => subset.cards.length > 0 || subset.parallels.length > 0);
}

export function normalizeCatalogueName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
