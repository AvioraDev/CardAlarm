import { normalizeCatalogueName, type ChecklistProduct, type ChecklistSubset, type SheetRow, type SheetTrace } from './checklist-parser';

/**
 * Import-time validation (CAR-77). An import must fail loudly when what it produces does not match the source,
 * so nothing is silently dropped the way a whole Base sheet was for 2020-21 Donruss Optic.
 */

export type Level = 'error' | 'warning' | 'accepted';

export interface Finding {
  level: Level;
  code: string;
  message: string;
  /** What the finding is about, so an accepted discrepancy can match it exactly. */
  detail?: FindingDetail;
  /** Why a known discrepancy in the source file was accepted (level "accepted" only). */
  acceptedReason?: string;
}

export interface FindingDetail {
  sheet: string;
  subset: string;
  parallel?: string;
  declared?: number;
  parsed?: number;
}

/**
 * A discrepancy in one source file that has been reviewed and accepted. It matches one finding only: the exact file
 * (by name and content hash), sheet, check, subset and expected values. If the workbook changes, or the numbers
 * differ, it stops applying and the import fails again.
 */
export interface AcceptedDiscrepancy {
  file: string;
  /** SHA-256 of the workbook the discrepancy was reviewed in. */
  sha256: string;
  sheet: string;
  /** The check that raised it, e.g. declared_count. */
  code: string;
  subset: string;
  parallel?: string;
  declared?: number;
  parsed?: number;
  reason: string;
}

export function matchesAccepted(item: AcceptedDiscrepancy, file: string, sha256: string | undefined, code: string, detail: FindingDetail | undefined): boolean {
  if (!detail || !sha256) return false;
  return (
    item.file === file && item.sha256 === sha256 && item.code === code && item.sheet === detail.sheet && item.subset === detail.subset &&
    item.parallel === detail.parallel && item.declared === detail.declared && item.parsed === detail.parsed
  );
}

export interface BlockStat {
  name: string;
  parent: string;
  from: number;
  to: number;
  expected: number;
  parsed: number;
}

export interface TeamsRookies {
  /** Rows in the Teams sheet flagged RC. */
  sourceRows: number;
  /** Of those, rows that found their card in the parsed subsets. */
  matchedRows: number;
  unmatched: string[];
}

export interface ValidationReport {
  file: string;
  season: string;
  productLine: string;
  ok: boolean;
  errors: number;
  warnings: number;
  accepted: number;
  stats: {
    sheets: Array<{ sheet: string; numberedCardRows: number; numberedCardsParsed: number; cardsParsed: number; subsets: number; blocks: number; notes: number; unplaced: number }>;
    subsets: number;
    blocks: number;
    parallels: number;
    cards: number;
    rookies: number;
    /** Cards whose rookie status is unknown (null): every card of a product whose source marks no rookies. */
    rookiesUnknown: number;
    rookiesFromBlocks: number;
    rookiesFromTeams: TeamsRookies;
    blockStats: BlockStat[];
    declaredCounts: Array<{ subset: string; declared: number; parsed: number }>;
  };
  findings: Finding[];
}

const RC_FLAG = /(^|\s)(RC|RR)(\s|$)/i;
const CARD_NUMBER = /^#?[A-Za-z0-9]{1,8}(?:[-.][A-Za-z0-9]{1,8}){0,3}$/;

function cells(row: SheetRow): string[] {
  return row.map(cell => (cell === null || cell === undefined ? '' : String(cell).replace(/\s+/g, ' ').trim())).filter(cell => cell !== '');
}

/** Rows of a Teams sheet that mark a rookie: [team, subset label, card number, player, ...flags]. */
export function readTeamsRookies(rows: SheetRow[]): Array<{ label: string; number: string; player: string }> {
  const found: Array<{ label: string; number: string; player: string }> = [];
  for (const row of rows.map(cells)) {
    if (row.length < 5) continue;
    const [, label, number, player, ...flags] = row;
    if (!label || !number || !player || !CARD_NUMBER.test(number) || !/[A-Za-z]{2}/.test(player)) continue;
    if (flags.some(flag => /(^|\s)RC(\s|$)/i.test(flag) || (RC_FLAG.test(flag) && /rated|rookie/i.test(flag)))) {
      found.push({ label, number: number.replace(/^#/, ''), player });
    }
  }
  return found;
}

/** Sets isRookie from Teams-sheet RC flags. A "Base" label covers the base set and all of its blocks. */
export function applyTeamsRookies(subsets: ChecklistSubset[], rookies: Array<{ label: string; number: string; player: string }>): TeamsRookies {
  let matchedRows = 0;
  const unmatched: string[] = [];
  for (const rookie of rookies) {
    const label = normalizeCatalogueName(rookie.label);
    const player = normalizeCatalogueName(rookie.player);
    let matched = false;
    for (const subset of subsets) {
      const isBase = subset.kind === 'base' && (label === 'base' || label === 'base set');
      if (!isBase && normalizeCatalogueName(subset.name) !== label) continue;
      for (const card of subset.cards) {
        if (card.cardNumber?.toLowerCase() === rookie.number.toLowerCase() && normalizeCatalogueName(card.playerName) === player) {
          card.isRookie = true;
          matched = true;
        }
      }
    }
    if (matched) matchedRows += 1;
    else unmatched.push(`${rookie.label} #${rookie.number} ${rookie.player}`);
  }
  return { sourceRows: rookies.length, matchedRows, unmatched };
}

/**
 * A product whose source marks no rookies at all (no RC flags, no rookie-named block) certainly still has rookie
 * cards, so "not a rookie" would be a claim without evidence. Every card's rookie status becomes unknown (null).
 * Products that do mark rookies keep false for the cards they leave unmarked.
 */
export function markUnknownRookies(subsets: ChecklistSubset[]): void {
  if (subsets.some(subset => subset.cards.some(card => card.isRookie === true))) return;
  for (const subset of subsets) for (const card of subset.cards) card.isRookie = null;
}

export interface ValidationInput {
  file: string;
  product: ChecklistProduct;
  /** Subsets after the sheets were parsed and merged. */
  subsets: ChecklistSubset[];
  traces: SheetTrace[];
  teams: TeamsRookies;
  /** Names of the workbook's sheets, to know whether a Base sheet existed. */
  sheetNames: string[];
  /** SHA-256 of the workbook, so accepted discrepancies apply to this exact file only. */
  sha256?: string;
  accepted?: AcceptedDiscrepancy[];
}

export function validateChecklist(input: ValidationInput): ValidationReport {
  const { subsets, traces } = input;
  const findings: Finding[] = [];
  const add = (level: Level, code: string, message: string, detail?: FindingDetail): void => {
    const known = level === 'accepted' ? undefined : input.accepted?.find(item => matchesAccepted(item, input.file, input.sha256, code, detail));
    findings.push(known ? { level: 'accepted', code, message, detail, acceptedReason: known.reason } : { level, code, message, detail });
  };
  const sheetOf = (name: string): string => traces.find(trace => trace.subsetHeaders.some(header => normalizeCatalogueName(header) === normalizeCatalogueName(name)))?.sheet ?? traces[0]?.sheet ?? '';

  // 1. Every numbered card row in the source reached the output, per sheet.
  for (const trace of traces) {
    if (trace.numberedCardRows !== trace.numberedCardsParsed) {
      add(
        'error',
        'cards_lost',
        `Sheet "${trace.sheet}": ${trace.numberedCardRows} numbered card rows in the source, ${trace.numberedCardsParsed} parsed (${trace.numberedCardRows - trace.numberedCardsParsed} lost)`
      );
    }
    if (trace.duplicatesRemoved > 0) {
      add('warning', 'duplicate_rows_removed', `Sheet "${trace.sheet}": ${trace.duplicatesRemoved} exact repeats of a card row dropped`);
    }
    if (trace.unplaced.length > 0) {
      add('error', 'rows_unplaced', `Sheet "${trace.sheet}": ${trace.unplaced.length} rows could not be placed, e.g. ${trace.unplaced.slice(0, 3).join(' ; ')}`);
    }
  }

  // 2. A Base sheet must produce a base subset (the 2020-21 Donruss Optic failure).
  const hasBaseSheet = input.sheetNames.some(name => /^base/i.test(name));
  if (hasBaseSheet && !subsets.some(subset => subset.kind === 'base' && subset.cards.length > 0)) {
    add('error', 'base_sheet_dropped', 'The workbook has a Base sheet but no base subset with cards was produced');
  }

  // 3. Card counts per block, against the range the source declares. A block declared in the Base sheet may list
  // its cards on another sheet (Donruss "Rated Rookie Signatures" is on Autographs); that counts as present.
  const blockStats: BlockStat[] = [];
  const referencedCards = new Map<string, number>(); // parent -> cards of blocks that live on another sheet
  for (const trace of traces) {
    for (const block of trace.blocks) {
      const found = subsets.find(subset => subset.parentName === block.parent && normalizeCatalogueName(subset.name) === normalizeCatalogueName(block.name));
      const elsewhere = found
        ? undefined
        : subsets.find(subset => !subset.parentName && normalizeCatalogueName(subset.name) === normalizeCatalogueName(block.name) && subset.cards.length > 0);
      const expected = block.implicit ? (found?.cards.length ?? 0) : block.to - block.from + 1;
      const parsed = found?.cards.length ?? elsewhere?.cards.length ?? 0;
      blockStats.push({ name: block.name, parent: block.parent, from: block.from, to: block.to, expected, parsed });
      if (elsewhere) {
        referencedCards.set(block.parent, (referencedCards.get(block.parent) ?? 0) + elsewhere.cards.length);
        if (parsed !== expected) add('error', 'block_count', `Block "${block.name}" (#${block.from}-${block.to}) is listed on another sheet: ${expected} cards declared by the range, ${parsed} there`, { sheet: trace.sheet, subset: block.name, declared: expected, parsed });
      } else if (!found) {
        if (!block.implicit) add('error', 'block_missing', `Block "${block.name}" (#${block.from}-${block.to}) is declared but not in the output`);
      } else if (!block.implicit && parsed !== expected) {
        add('error', 'block_count', `Block "${block.name}" (#${block.from}-${block.to}): ${expected} cards declared by the range, ${parsed} parsed`, { sheet: trace.sheet, subset: block.name, declared: expected, parsed });
      }
    }
  }

  // 4. "N cards" declared for a subset equals its cards plus those of its blocks.
  const declaredCounts: ValidationReport['stats']['declaredCounts'] = [];
  for (const subset of subsets.filter(candidate => !candidate.parentName && candidate.declaredCardCount !== null)) {
    const blocks = subsets.filter(candidate => candidate.parentName === subset.name);
    const parsed = subset.cards.length + blocks.reduce((sum, block) => sum + block.cards.length, 0) + (referencedCards.get(subset.name) ?? 0);
    declaredCounts.push({ subset: subset.name, declared: subset.declaredCardCount!, parsed });
    // "Base Set: 300 cards" can be completed by the sets listed right after it ("Combo Cards", "Base Legends").
    const following: ChecklistSubset[] = [];
    let running = parsed;
    for (const later of subsets.slice(subsets.indexOf(subset) + 1)) {
      if (running >= subset.declaredCardCount! || later.parentName || later.kind !== subset.kind) break;
      running += later.cards.length;
      following.push(later);
    }
    if (parsed < subset.declaredCardCount! && running === subset.declaredCardCount) {
      declaredCounts[declaredCounts.length - 1]!.parsed = running;
      continue;
    }
    if (parsed < subset.declaredCardCount!) {
      // Fewer cards than the source declares: cards are missing from the output.
      add('error', 'declared_count', `Subset "${subset.name}": ${subset.declaredCardCount} cards declared, ${parsed} parsed (${subset.declaredCardCount! - parsed} missing)`, { sheet: sheetOf(subset.name), subset: subset.name, declared: subset.declaredCardCount!, parsed });
    } else if (parsed > subset.declaredCardCount!) {
      // More cards than the source declares: every row is present, the declared total is stale.
      add('warning', 'declared_count_stale', `Subset "${subset.name}": ${subset.declaredCardCount} cards declared, ${parsed} listed`, { sheet: sheetOf(subset.name), subset: subset.name, declared: subset.declaredCardCount!, parsed });
    }
  }

  // 5. Every subset, block and parallel named in the source is in the output.
  const outputSubsets = new Set(subsets.map(subset => normalizeCatalogueName(subset.name)));
  const outputParallels = new Set(subsets.flatMap(subset => subset.parallels.map(parallel => `${normalizeCatalogueName(subset.name)}|${normalizeCatalogueName(parallel.name)}`)));
  for (const trace of traces) {
    for (const name of [...trace.subsetHeaders, ...trace.blocks.filter(block => !block.implicit).map(block => block.name)]) {
      if (!outputSubsets.has(normalizeCatalogueName(name))) add('error', 'subset_missing', `Subset or block "${name}" is named in sheet "${trace.sheet}" but not in the output`);
    }
    for (const entry of trace.parallelNames) {
      const [owner, name] = entry.split(' | ');
      if (!outputParallels.has(`${normalizeCatalogueName(owner!)}|${normalizeCatalogueName(name!)}`)) {
        add('error', 'parallel_missing', `Parallel "${name}" listed under "${owner}" in sheet "${trace.sheet}" is not in the output`);
      }
    }
  }

  // 5b. A parallel named like a subset or block of the same product is usually a heading read as a parallel
  // (Donruss 2020-21 "Veterans"). Names that are genuinely both are listed in the accepted discrepancies.
  for (const subset of subsets) {
    for (const parallel of subset.parallels) {
      if (outputSubsets.has(normalizeCatalogueName(parallel.name))) {
        add('warning', 'parallel_subset_name_collision', `Parallel "${parallel.name}" under "${subset.name}" has the same name as a subset or block of this product`, {
          sheet: sheetOf(subset.name),
          subset: subset.name,
          parallel: parallel.name,
        });
      }
    }
  }

  // 6. Rookie flags: every RC row in the source Teams sheet found its card.
  const rookies = subsets.reduce((sum, subset) => sum + subset.cards.filter(card => card.isRookie === true).length, 0);
  const rookiesUnknown = subsets.reduce((sum, subset) => sum + subset.cards.filter(card => card.isRookie === null).length, 0);
  const rookiesFromBlocks = subsets
    .filter(subset => subset.parentName && /rookie/i.test(subset.name))
    .reduce((sum, subset) => sum + subset.cards.length, 0);
  if (input.teams.matchedRows < input.teams.sourceRows) {
    add(
      'warning',
      'rookie_rows_unmatched',
      `${input.teams.sourceRows - input.teams.matchedRows} of ${input.teams.sourceRows} RC rows in the Teams sheet found no card, e.g. ${input.teams.unmatched.slice(0, 3).join(' ; ')}`
    );
  }
  if (input.teams.sourceRows > 0 && rookies === 0) add('error', 'rookies_lost', 'The Teams sheet marks rookies but none were flagged');
  if (input.teams.sourceRows === 0 && rookies === 0 && subsets.some(subset => subset.cards.length > 0)) {
    add('warning', 'rookies_not_marked_in_source', `The source marks no rookies (no RC flags in the Teams sheet, no rookie-named block), so rookie status of all ${rookiesUnknown} cards is stored as unknown`);
  }

  const errors = findings.filter(finding => finding.level === 'error').length;
  const accepted = findings.filter(finding => finding.level === 'accepted').length;
  return {
    file: input.file,
    season: input.product.season,
    productLine: input.product.productLine,
    ok: errors === 0,
    errors,
    warnings: findings.length - errors - accepted,
    accepted,
    stats: {
      sheets: traces.map(trace => ({
        sheet: trace.sheet,
        numberedCardRows: trace.numberedCardRows,
        numberedCardsParsed: trace.numberedCardsParsed,
        cardsParsed: trace.cardsParsed,
        subsets: trace.subsetHeaders.length,
        blocks: trace.blocks.length,
        notes: trace.notes.length,
        unplaced: trace.unplaced.length,
      })),
      subsets: subsets.length,
      blocks: subsets.filter(subset => subset.parentName).length,
      parallels: subsets.reduce((sum, subset) => sum + subset.parallels.length, 0),
      cards: subsets.reduce((sum, subset) => sum + subset.cards.length, 0),
      rookies,
      rookiesUnknown,
      rookiesFromBlocks,
      rookiesFromTeams: input.teams,
      blockStats,
      declaredCounts,
    },
    findings,
  };
}
