import fs from 'fs';
import path from 'path';
import { parseChecklistFile, planRookieUpdate, type DbCardRef } from '../src/catalogue/import-checklists';
import { parseSubsetSheet, parseSubsetSheetDetailed, type SheetRow } from '../src/catalogue/checklist-parser';
import {
  applyTeamsRookies,
  markUnknownRookies,
  readTeamsRookies,
  validateChecklist,
  type AcceptedDiscrepancy,
} from '../src/catalogue/checklist-validate';

/**
 * CAR-77: the importer must not lose sets, blocks or rookies, and an import must fail loudly when it does.
 * Sheet layouts below are reduced copies of the real ones that broke.
 */

const card = (n: number, name: string, team = 'Some Team'): SheetRow => [n, name, team];

describe('checklist parser: sets without an "N cards" row (2020-21 Donruss Optic)', () => {
  it('opens a base set from a "Parallels:" heading when there is no count row, instead of dropping every card', () => {
    const subsets = parseSubsetSheet('Base', [
      ['Base Set'], [], [], [], [],
      ['Parallels:'], [],
      ['Blue Pulsar'],
      ['Premium Box Set - /249'],
      [],
      card(1, 'Kyle Kuzma'),
      card(2, 'Jimmy Butler'),
    ]);

    expect(subsets).toHaveLength(1);
    expect(subsets[0]).toMatchObject({ name: 'Base Set', kind: 'base' });
    expect(subsets[0]!.cards).toHaveLength(2);
    expect(subsets[0]!.parallels.map(parallel => parallel.name)).toEqual(['Blue Pulsar', 'Premium Box Set']);
  });

  it('still reads an insert heading that is followed by a count row', () => {
    const subsets = parseSubsetSheet('Inserts', [['Bang!'], ['2 cards'], card(1, 'Luka Doncic'), card(2, 'Trae Young')]);
    expect(subsets).toHaveLength(1);
    expect(subsets[0]).toMatchObject({ name: 'Bang!', kind: 'insert' });
  });

  it('reads parallels listed straight after the count row with no "Parallels:" heading', () => {
    const subsets = parseSubsetSheet('Inserts', [['Elevate Checklist'], ['2 cards.'], ['Mosaic'], ['Green Mosaic'], ['Blue Mosaic - /99'], card(1, 'Zach LaVine'), card(2, 'Jayson Tatum')]);
    expect(subsets[0]!.parallels.map(parallel => parallel.name)).toEqual(['Mosaic', 'Green Mosaic', 'Blue Mosaic']);
    expect(subsets[0]!.cards).toHaveLength(2);
  });
});

describe('checklist parser: base-set blocks (Chronicles Crusade #516-545)', () => {
  const chronicles: SheetRow[] = [
    ['Base Set'], ['4 cards.'],
    ['Prestige - #1-2'],
    ['Plates and Patches - #3-4'],
    ['Prestige'], ['Parallels:'], ['Asia'], ['Red - /149'], card(1, 'Jimmy Butler'), card(2, 'Jamal Murray'),
    ['Plates & Patches'], ['Parallels:'], ['Red - /149'], card(3, 'Donovan Mitchell'), card(4, 'LaMelo Ball'),
  ];

  it('makes each block a subset of its own, with its own cards and parallels', () => {
    const subsets = parseSubsetSheet('Base', chronicles);

    expect(subsets.map(subset => subset.name)).toEqual(['Base Set', 'Prestige', 'Plates and Patches']);
    expect(subsets[1]).toMatchObject({ parentName: 'Base Set', numberFrom: 1, numberTo: 2 });
    expect(subsets[1]!.parallels.map(parallel => parallel.name)).toEqual(['Asia', 'Red']);
    // The heading says "Plates & Patches", the definition says "Plates and Patches": the same block.
    expect(subsets[2]).toMatchObject({ parentName: 'Base Set', numberFrom: 3, numberTo: 4 });
    expect(subsets[2]!.cards.map(c => c.cardNumber)).toEqual(['3', '4']);
  });

  it('shares one parallels list when the sheet gives only one (Donruss: blocks are just number ranges)', () => {
    const subsets = parseSubsetSheet('Base', [
      ['Base Set'], ['4 cards.'], ['Rated Rookies - #3-4'], [], ['Parallels:'], ['Red /99'], card(1, 'A Vet'), card(2, 'B Vet'), card(3, 'C Rookie'), card(4, 'D Rookie'),
    ]);

    const base = subsets.find(subset => subset.name === 'Base Set')!;
    const block = subsets.find(subset => subset.name === 'Rated Rookies')!;
    expect(base.parallels).toHaveLength(1);
    expect(base.cards.map(c => c.cardNumber)).toEqual(['1', '2']);
    expect(block.parallels).toHaveLength(0);
    expect(block.cards.map(c => c.cardNumber)).toEqual(['3', '4']);
  });

  it('flags every card of a rookie-named block as a rookie, recovering flags the rows do not carry', () => {
    const subsets = parseSubsetSheet('Base', [['Base Set'], ['4 cards.'], ['Rated Rookies - #3-4'], card(1, 'A Vet'), card(2, 'B Vet'), card(3, 'C Rookie'), card(4, 'D Rookie')]);

    expect(subsets.find(subset => subset.name === 'Rated Rookies')!.cards.every(c => c.isRookie)).toBe(true);
    expect(subsets.find(subset => subset.name === 'Base Set')!.cards.some(c => c.isRookie)).toBe(false);
  });

  it('treats headings inside a set whose declared total is not yet reached as its blocks (Court Kings, Contenders)', () => {
    const subsets = parseSubsetSheet('Base', [
      ['Base Set'], ['5 cards.'],
      ['Veterans'], ['Parallels:'], ['Artist Proof'], card(1, 'A'), card(2, 'B'), card(3, 'C'),
      ['Rookies I'], card(4, 'D'), card(5, 'E'),
    ]);

    expect(subsets.map(subset => subset.name)).toEqual(['Base Set', 'Veterans', 'Rookies I']);
    expect(subsets[1]).toMatchObject({ parentName: 'Base Set', numberFrom: 1, numberTo: 3 });
    expect(subsets[2]).toMatchObject({ parentName: 'Base Set', numberFrom: 4, numberTo: 5 });
  });

  it('takes a later set named for a declared block as that block (Optic 2024-25: "Legends" and "Base - Legends")', () => {
    const subsets = parseSubsetSheet('Base', [
      ['Base Set'], ['5 cards'],
      ['Veterans: #s 1-3'], ['Legends: #s 4-5'],
      ['Parallels:'], ['Red /99'], card(1, 'A'), card(2, 'B'), card(3, 'C'),
      ['Base - Legends'], ['2 cards'], card(4, 'D'), card(5, 'E'),
    ]);

    const legends = subsets.find(subset => subset.name === 'Legends')!;
    expect(legends).toMatchObject({ parentName: 'Base Set', numberFrom: 4, numberTo: 5 });
    expect(legends.cards).toHaveLength(2);
    expect(subsets.some(subset => subset.name === 'Base - Legends')).toBe(false);
  });

  it('keeps a group heading as the parent of its sections ("Road to the Finals" > "First Round")', () => {
    const subsets = parseSubsetSheet('Inserts', [
      ['Road to the Finals Checklist'], [], ['First Round'], card(1, 'A'), card(2, 'B'), ['Second Round'], card(3, 'C'),
    ]);

    expect(subsets.map(subset => [subset.name, subset.parentName ?? null])).toEqual([
      ['Road to the Finals', null],
      ['First Round', 'Road to the Finals'],
      ['Second Round', 'Road to the Finals'],
    ]);
  });

  it('ends a parallels list at the first block heading instead of reading it as one more parallel (Donruss 2020-21 "Veterans")', () => {
    const subsets = parseSubsetSheet('Base', [
      ['Base Set'], ['4 cards.'], ['Veterans - #1-2'], ['Rated Rookies - #3-4'],
      ['Parallels:'], ['Green Flood'], ['Red Press Proof - /99'],
      ['Veterans'], card(1, 'A'), card(2, 'B'),
      ['Rated Rookies'], card(3, 'C'), card(4, 'D'),
    ]);

    expect(subsets.find(subset => subset.name === 'Base Set')!.parallels.map(parallel => parallel.name)).toEqual(['Green Flood', 'Red Press Proof']);
    expect(subsets.find(subset => subset.name === 'Veterans')!.cards).toHaveLength(2);
    expect(subsets.find(subset => subset.name === 'Rated Rookies')!.cards.every(c => c.isRookie)).toBe(true);
  });

  it('keeps a remark such as "select cards only, list below" out of the parallel name', () => {
    const subsets = parseSubsetSheet('Autographs', [['Signatures'], ['1 cards.'], ['Parallels:'], ['Green Ice Prizms - select cards only, list below'], ['Gold Prizms - /10'], card(1, 'A')]);
    expect(subsets[0]!.parallels.map(parallel => parallel.name)).toEqual(['Green Ice Prizms', 'Gold Prizms']);
    expect(subsets[0]!.parallels[0]!.note).toMatch(/select cards only/i);
  });

  it('drops exact repeated card rows within a subset and says so', () => {
    const { subsets, trace } = parseSubsetSheetDetailed('Base', [['Base Set'], ['2 cards.'], card(1, 'A'), card(2, 'B'), card(1, 'A'), card(2, 'B')]);

    expect(subsets[0]!.cards).toHaveLength(2);
    expect(trace.duplicatesRemoved).toBe(2);
  });
});

describe('rookie flags from the Teams sheet', () => {
  it('reads RC rows and flags the matching base-set cards, including cards in blocks', () => {
    const subsets = parseSubsetSheet('Base', [['Base Set'], ['3 cards.'], ['Rated Rookies - #2-3'], card(1, 'Vet One'), card(2, 'Kid Two'), card(3, 'Kid Three')]);
    const rows: SheetRow[] = [
      ['Team A', 'Base', '2', 'Kid Two', 'RR', 'RC'],
      ['Team B', 'Base', '1', 'Vet One'],
      ['Team C', 'Fast Break Signatures', '9', 'Nobody Known', 'RC'],
    ];

    const result = applyTeamsRookies(subsets, readTeamsRookies(rows));

    expect(result).toMatchObject({ sourceRows: 2, matchedRows: 1 });
    expect(result.unmatched).toEqual(['Fast Break Signatures #9 Nobody Known']);
    expect(subsets.find(subset => subset.name === 'Rated Rookies')!.cards.map(c => c.isRookie)).toEqual([true, true]);
    expect(subsets.find(subset => subset.name === 'Base Set')!.cards[0]!.isRookie).toBe(false);
  });
});

describe('import-time validation fails loudly', () => {
  const product = { season: '2020-21', brand: 'Panini', productLine: 'Test', sourceFile: 'test.xlsx' };
  const noTeams = { sourceRows: 0, matchedRows: 0, unmatched: [] };

  function validate(rows: SheetRow[], extra: { accepted?: AcceptedDiscrepancy[]; sheetNames?: string[] } = {}) {
    const { subsets, trace } = parseSubsetSheetDetailed('Base', rows);
    return validateChecklist({ file: 'test.xlsx', product, subsets, traces: [trace], teams: noTeams, sheetNames: extra.sheetNames ?? ['Base'], accepted: extra.accepted });
  }

  it('passes a sheet whose declared counts and block ranges match', () => {
    const report = validate([['Base Set'], ['4 cards.'], ['Rated Rookies - #3-4'], card(1, 'A'), card(2, 'B'), card(3, 'C'), card(4, 'D')]);
    expect(report).toMatchObject({ ok: true, errors: 0 });
    expect(report.stats.blockStats).toEqual([{ name: 'Rated Rookies', parent: 'Base Set', from: 3, to: 4, expected: 2, parsed: 2 }]);
  });

  it('fails when fewer cards are listed than the sheet declares', () => {
    const report = validate([['Base Set'], ['4 cards.'], card(1, 'A'), card(2, 'B')]);
    expect(report.ok).toBe(false);
    expect(report.findings.map(finding => finding.code)).toContain('declared_count');
  });

  it('only warns when more cards are listed than declared (the rows are all present)', () => {
    const report = validate([['Base Set'], ['1 cards.'], card(1, 'A'), card(2, 'B')]);
    expect(report.ok).toBe(true);
    expect(report.findings.map(finding => finding.code)).toContain('declared_count_stale');
  });

  it('fails when a block range and its cards disagree', () => {
    const report = validate([['Base Set'], ['4 cards.'], ['Rated Rookies - #3-5'], card(1, 'A'), card(2, 'B'), card(3, 'C'), card(4, 'D')]);
    expect(report.findings.map(finding => finding.code)).toContain('block_count');
    expect(report.ok).toBe(false);
  });

  it('fails when a Base sheet produced no base set at all', () => {
    const report = validateChecklist({ file: 'test.xlsx', product, subsets: [], traces: [], teams: noTeams, sheetNames: ['Master', 'Base'] });
    expect(report.ok).toBe(false);
    expect(report.findings.map(finding => finding.code)).toContain('base_sheet_dropped');
  });

  it('fails when numbered card rows in the source did not all reach the output', () => {
    const { subsets, trace } = parseSubsetSheetDetailed('Base', [['Base Set'], ['2 cards.'], card(1, 'A'), card(2, 'B')]);
    const tampered = { ...trace, numberedCardsParsed: trace.numberedCardsParsed - 1 };
    const report = validateChecklist({ file: 'test.xlsx', product, subsets, traces: [tampered], teams: noTeams, sheetNames: ['Base'] });
    expect(report.findings.map(finding => finding.code)).toContain('cards_lost');
  });

  it('lets a reviewed source discrepancy through only when file hash, sheet, subset and numbers all match', () => {
    const rows: SheetRow[] = [['Base Set'], ['4 cards.'], card(1, 'A'), card(2, 'B'), card(4, 'D')];
    const entry: AcceptedDiscrepancy = { file: 'test.xlsx', sha256: 'abc', sheet: 'Base', code: 'declared_count', subset: 'Base Set', declared: 4, parsed: 3, reason: 'The file skips #3.' };
    const run = (accepted: AcceptedDiscrepancy[], sha256 = 'abc', file = 'test.xlsx') => {
      const { subsets, trace } = parseSubsetSheetDetailed('Base', rows);
      return validateChecklist({ file, product, subsets, traces: [trace], teams: noTeams, sheetNames: ['Base'], sha256, accepted });
    };

    const report = run([entry]);
    expect(report).toMatchObject({ ok: true, errors: 0, accepted: 1 });
    expect(report.findings[0]).toMatchObject({ level: 'accepted', acceptedReason: 'The file skips #3.' });

    expect(run([entry], 'changed-file').ok).toBe(false); // the workbook changed
    expect(run([{ ...entry, file: 'other.xlsx' }]).ok).toBe(false);
    expect(run([{ ...entry, sheet: 'Inserts' }]).ok).toBe(false);
    expect(run([{ ...entry, subset: 'Other' }]).ok).toBe(false);
    expect(run([{ ...entry, parsed: 2 }]).ok).toBe(false); // a different number of cards is a new defect
    expect(run([{ ...entry, declared: 5 }]).ok).toBe(false);
  });

  it('warns when a parallel has the same name as a subset or block of the product, and accepts it only when listed', () => {
    const rows: SheetRow[] = [['Base Set'], ['2 cards.'], ['Parallels:'], ['Veterans'], ['Red /99'], card(1, 'A'), card(2, 'B'), ['Veterans'], ['1 cards.'], card(3, 'C')];
    const { subsets, trace } = parseSubsetSheetDetailed('Base', rows);
    const base = { file: 'test.xlsx', product, subsets, traces: [trace], teams: noTeams, sheetNames: ['Base'], sha256: 'abc' };

    const flagged = validateChecklist(base).findings.filter(finding => finding.code === 'parallel_subset_name_collision');
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ level: 'warning', detail: { subset: 'Base Set', parallel: 'Veterans' } });

    const accepted: AcceptedDiscrepancy = { file: 'test.xlsx', sha256: 'abc', sheet: 'Base', code: 'parallel_subset_name_collision', subset: 'Base Set', parallel: 'Veterans', reason: 'Genuinely both.' };
    const exempt = validateChecklist({ ...base, accepted: [accepted] }).findings.filter(finding => finding.code === 'parallel_subset_name_collision');
    expect(exempt[0]!.level).toBe('accepted');
  });
});

describe('rookie status is unknown, not false, where the source marks no rookies', () => {
  it('stores null for every card of a product whose source marks no rookies', () => {
    const subsets = parseSubsetSheet('Base', [['Base Set'], ['2 cards.'], card(1, 'A'), card(2, 'B')]);
    applyTeamsRookies(subsets, []);
    markUnknownRookies(subsets);
    expect(subsets[0]!.cards.map(c => c.isRookie)).toEqual([null, null]);
  });

  it('keeps false for unmarked cards when the source does mark rookies', () => {
    const subsets = parseSubsetSheet('Base', [['Base Set'], ['3 cards.'], ['Rated Rookies - #3-3'], card(1, 'A'), card(2, 'B'), card(3, 'C')]);
    applyTeamsRookies(subsets, []);
    markUnknownRookies(subsets);
    expect(subsets.find(subset => subset.name === 'Base Set')!.cards.map(c => c.isRookie)).toEqual([false, false]);
    expect(subsets.find(subset => subset.name === 'Rated Rookies')!.cards.map(c => c.isRookie)).toEqual([true]);
  });

  it('reports the unknown count for the 15 real products that mark no rookies', () => {
    const parsed = parseChecklistFile(path.join(__dirname, '../../docs/sets/incoming/2022-23-Panini-Prizm-Basketball-Checklist.xlsx'))!;
    expect(parsed.report.stats.rookies).toBe(0);
    expect(parsed.report.stats.rookiesUnknown).toBe(parsed.report.stats.cards);
    expect(parsed.subsets.every(subset => subset.cards.every(c => c.isRookie === null))).toBe(true);
  });
});

describe('the real workbooks (CAR-77)', () => {
  const root = path.join(__dirname, '../..');
  const optic = path.join(root, 'docs/sets/incoming/2020-21-Donruss-Optic-Basketball-Checklist.xlsx');
  const chronicles = path.join(root, 'docs/sets/incoming/2020-21-Panini-Chronicles-Basketball-Checklist.xlsx');

  it('2020-21 Donruss Optic keeps its 200 base cards, rated rookies included', () => {
    const parsed = parseChecklistFile(optic)!;
    const base = parsed.subsets.filter(subset => subset.kind === 'base');

    expect(parsed.report.ok).toBe(true);
    expect(base.reduce((sum, subset) => sum + subset.cards.length, 0)).toBe(200);
    const pokusevski = base.flatMap(subset => subset.cards).find(c => c.cardNumber === '167');
    expect(pokusevski).toMatchObject({ playerName: 'Aleksej Pokusevski', isRookie: true });
  });

  it('2020-21 Chronicles keeps 27 base blocks and puts #523 James Wiseman in Crusade', () => {
    const parsed = parseChecklistFile(chronicles)!;
    const blocks = parsed.subsets.filter(subset => subset.parentName === 'Base Set');

    expect(parsed.report.ok).toBe(true);
    expect(blocks).toHaveLength(27);
    const crusade = blocks.find(block => block.name === 'Crusade')!;
    expect(crusade).toMatchObject({ numberFrom: 516, numberTo: 545 });
    expect(crusade.cards.find(c => c.cardNumber === '523')?.playerName).toBe('James Wiseman');
    expect(crusade.parallels.length).toBeGreaterThan(0);
    // Rookies and Stars is #651-675 and is a rookie block.
    expect(blocks.find(block => block.name === 'Rookies and Stars')!.cards.every(c => c.isRookie)).toBe(true);
  });

  it('every workbook validates, and the rookies the source marks are recovered', () => {
    const files = ['docs/sets', 'docs/sets/incoming'].flatMap(dir =>
      fs.readdirSync(path.join(root, dir)).filter(file => /\.xlsx$/i.test(file) && !/\(\d+\)\.xlsx$/i.test(file)).map(file => path.join(root, dir, file))
    );
    const failures: string[] = [];
    let rookies = 0;
    let teamsRows = 0;
    let teamsMatched = 0;
    for (const file of files) {
      const parsed = parseChecklistFile(file);
      if (!parsed) continue;
      if (!parsed.report.ok) failures.push(`${path.basename(file)}: ${parsed.report.findings.filter(f => f.level === 'error').map(f => f.message).join(' | ')}`);
      rookies += parsed.report.stats.rookies;
      teamsRows += parsed.report.stats.rookiesFromTeams.sourceRows;
      teamsMatched += parsed.report.stats.rookiesFromTeams.matchedRows;
    }

    expect(failures).toEqual([]);
    expect(files.length).toBeGreaterThanOrEqual(57);
    expect(teamsMatched).toBe(teamsRows);
    // The old importer flagged 705 rookies in the whole catalogue.
    expect(rookies).toBeGreaterThan(2500);
  }, 120000);
});

describe('in-place rookie update (detaches nothing)', () => {
  const subsets = () => parseSubsetSheet('Base', [['Base Set'], ['3 cards.'], ['Rated Rookies - #3-3'], card(1, 'Vet One'), card(2, 'Vet Two'), card(3, 'Kid Three')]);
  const db = (isRookie: Array<boolean | null>): DbCardRef[] =>
    ['vet one', 'vet two', 'kid three'].map((player, index) => ({
      id: String(index + 1),
      kind: 'base',
      subsetNormalizedName: index === 2 ? 'rated rookies' : 'base set',
      cardNumber: String(index + 1),
      normalizedPlayerName: player,
      isRookie: isRookie[index]!,
    }));

  it('plans updates only for cards whose flag differs, matched by subset, number and player', () => {
    const plan = planRookieUpdate(db([false, false, false]), subsets());
    expect(plan).toEqual({ ok: true, updates: [{ id: '3', isRookie: true }], unchanged: 2 });
  });

  it('plans null (unknown) over a stored false', () => {
    const all = parseSubsetSheet('Base', [['Base Set'], ['2 cards.'], card(1, 'Vet One'), card(2, 'Vet Two')]);
    markUnknownRookies(all);
    const rows = db([false, false, false]).slice(0, 2);
    expect(planRookieUpdate(rows, all)).toEqual({ ok: true, updates: [{ id: '1', isRookie: null }, { id: '2', isRookie: null }], unchanged: 0 });
  });

  it('refuses when the stored cards differ from the source, so a full re-import is needed', () => {
    expect(planRookieUpdate(db([false, false, false]).slice(0, 2), subsets())).toMatchObject({ ok: false });
    const changed = db([false, false, false]);
    changed[1]!.normalizedPlayerName = 'someone else';
    expect(planRookieUpdate(changed, subsets())).toMatchObject({ ok: false });
    const moved = db([false, false, false]);
    moved[2]!.subsetNormalizedName = 'base set';
    expect(planRookieUpdate(moved, subsets())).toMatchObject({ ok: false });
  });
});
