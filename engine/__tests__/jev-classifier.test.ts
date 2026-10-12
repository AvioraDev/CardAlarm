import {
  isSubsetSheet,
  parseParallelLine,
  parseSubsetSheet,
  productFromFileName,
} from '../src/catalogue/checklist-parser';
import {
  CatalogueIndex,
  playerKey,
  productAliases,
  generateProductAliases,
  cardNumbersAgree,
  storeProvidedNames,
  titleNameSpans,
  type CatalogueProduct,
  type CatalogueSubset,
} from '../src/classify/catalogue-index';
import {
  buildOptions,
  classifyListing,
  JEV_CLASSIFIER_VERSION,
  parallelsMatchingSerial,
  subsetsConsistentWithTitle,
} from '../src/classify/classifier';
import { buildListingEvidence, evidenceHash, titleOnlyEvidence, type ListingEvidence } from '../src/classify/evidence';
import { createJevClient, type JevClient, type JevQuestion, type JevResponse } from '../src/classify/jev-client';
import { parseCardNumber, parseGrade, parseSeason, parseSerial, parseTitleFields } from '../src/classify/title-fields';

describe('checklist parser', () => {
  it('reads the season, brand and product line from a checklist file name', () => {
    expect(productFromFileName('2023-24-Panini-Prizm-Basketball-Checklist.xlsx')).toMatchObject({
      season: '2023-24',
      brand: 'Panini',
      productLine: 'Prizm',
    });
    expect(productFromFileName('2023-24-Panini-NBA-Hoops-Basketball-Checklist.xlsx')?.productLine).toBe('Hoops');
    expect(productFromFileName('2021-22-Donruss-Optic-Basketball-Checklist.xlsx')).toMatchObject({
      brand: 'Panini',
      productLine: 'Donruss Optic',
    });
    expect(productFromFileName('2025-26-Topps-Chrome-Sapphire-Basketball-Checklist.xlsx')).toMatchObject({
      brand: 'Topps',
      productLine: 'Chrome Sapphire',
    });
    expect(productFromFileName('2025-26-Topps-Basketball-Checklist.xlsx')?.productLine).toBe('Topps');
    expect(productFromFileName('2024-25-Panini-Silhouette-Basketball-Checklist(1).xlsx')?.productLine).toBe('Silhouette');
    expect(productFromFileName('notes.xlsx')).toBeNull();
  });

  it('skips the master, team and update sheets, which repeat or mix in other products', () => {
    expect(isSubsetSheet('Base')).toBe(true);
    expect(isSubsetSheet('Autographs')).toBe(true);
    expect(isSubsetSheet('Master Checklist')).toBe(false);
    expect(isSubsetSheet('Teams')).toBe(false);
    expect(isSubsetSheet('Updates')).toBe(false);
    expect(isSubsetSheet('Full Checklist')).toBe(false);
  });

  it('parses parallel lines with and without print runs', () => {
    expect(parseParallelLine('Red Prizms /299')).toEqual({ name: 'Red Prizms', serialLimit: 299, note: null });
    expect(parseParallelLine('Maroon - /115')).toEqual({ name: 'Maroon', serialLimit: 115, note: null });
    expect(parseParallelLine('First Card /1')).toEqual({ name: 'First Card', serialLimit: 1, note: null });
    expect(parseParallelLine('Black 1/1')).toEqual({ name: 'Black', serialLimit: 1, note: null });
    expect(parseParallelLine('Silver Prizms')).toEqual({ name: 'Silver Prizms', serialLimit: null, note: null });
    expect(parseParallelLine('Player Number (Select cards; see list below)')).toEqual({
      name: 'Player Number',
      serialLimit: null,
      note: 'Select cards; see list below',
    });
  });

  it('splits a sheet into subsets with their parallels and cards', () => {
    const subsets = parseSubsetSheet('Base', [
      ['Base Set', '', ''],
      ['', '', ''],
      ['3 cards', '', ''],
      ['Parallels', '', ''],
      ['', '', ''],
      ['Silver Prizms', '', ''],
      ['Blue Ice Prizms /125', '', ''],
      ['', '', ''],
      [1, 'Victor Wembanyama', 'San Antonio Spurs'],
      [2, 'Chet Holmgren', 'Oklahoma City Thunder', 'RC'],
      ['RS-DOT', 'Daniel Oturu', 'Los Angeles Clippers', '/', 99],
      ['', '', ''],
      ['Base Legends', '', ''],
      ['1 card', '', ''],
      [301, 'Kobe Bryant', 'Los Angeles Lakers'],
    ]);

    expect(subsets.map(subset => subset.name)).toEqual(['Base Set', 'Base Legends']);
    expect(subsets[0]).toMatchObject({ kind: 'base', declaredCardCount: 3 });
    expect(subsets[0]!.parallels).toEqual([
      { name: 'Silver Prizms', serialLimit: null, note: null },
      { name: 'Blue Ice Prizms', serialLimit: 125, note: null },
    ]);
    expect(subsets[0]!.cards).toEqual([
      { cardNumber: '1', playerName: 'Victor Wembanyama', teamName: 'San Antonio Spurs', isRookie: false, serialLimit: null },
      { cardNumber: '2', playerName: 'Chet Holmgren', teamName: 'Oklahoma City Thunder', isRookie: true, serialLimit: null },
      { cardNumber: 'RS-DOT', playerName: 'Daniel Oturu', teamName: 'Los Angeles Clippers', isRookie: false, serialLimit: 99 },
    ]);
    expect(subsets[1]!.cards[0]).toMatchObject({ cardNumber: '301', playerName: 'Kobe Bryant' });
  });

  it('ignores odds and notes that are not in a parallels list', () => {
    const subsets = parseSubsetSheet('Inserts', [
      ['Sapphire Selections'],
      ['20 cards'],
      ['1:11 packs'],
      [1, 'Stephen Curry', 'Golden State Warriors'],
    ]);
    expect(subsets[0]).toMatchObject({ kind: 'insert', parallels: [] });
    expect(subsets[0]!.cards).toHaveLength(1);
  });
});

describe('title fields', () => {
  it('reads seasons and offers both seasons a bare year could mean', () => {
    expect(parseSeason('2023-24 Panini Prizm #1')).toEqual({ season: '2023-24', seasonCandidates: ['2023-24'] });
    expect(parseSeason('2023/24 Panini Prizm #1').season).toBe('2023-24');
    expect(parseSeason('Panini Prizm 2019-20 Green Prizm').season).toBe('2019-20');
    expect(parseSeason('2025 Topps Chrome #295')).toEqual({ season: '2025', seasonCandidates: ['2025-26', '2024-25', '2025'] });
    expect(parseSeason('Panini Prizm Silver').season).toBeNull();
  });

  it('separates card numbers from print runs', () => {
    expect(parseCardNumber('2019-20 Panini Chronicles #587 Cam Reddish Purple #/49 RC')).toBe('587');
    expect(parseCardNumber('2024-25 Topps Chrome NBL FLYNN CAMERON Base Green 39/99 #45')).toBe('45');
    expect(parseCardNumber('2020-21 Panini Contenders #RS-DOT Daniel Oturu')).toBe('RS-DOT');
    expect(parseCardNumber('Card numbered #39/99 only')).toBeNull();
    expect(parseCardNumber('1995 Hoops #2 of 25 Shaquille O\'Neal')).toBe('2');
  });

  it('reads "No." card numbers without matching names that start with No', () => {
    expect(parseCardNumber('2020-21 Panini Mosaic Finals MVPs Dirk Nowitzki - No. 298 (B)')).toBe('298');
    expect(parseCardNumber('2020-21 Panini Mosaic Dirk Nowitzki')).toBeNull();
  });

  it('reads print runs and ignores seasons written with a slash', () => {
    expect(parseSerial('Cam Reddish Purple #/49 RC')).toEqual({ serialCurrent: null, serialLimit: 49 });
    expect(parseSerial('Base Green 39/99 #45')).toEqual({ serialCurrent: 39, serialLimit: 99 });
    expect(parseSerial('2023/24 Panini Prizm #12')).toEqual({ serialCurrent: null, serialLimit: null });
    expect(parseSerial('Gold Vinyl 1 of 1')).toEqual({ serialCurrent: 1, serialLimit: 1 });
    expect(parseSerial('2023-24 Panini Prizm #12 Silver')).toEqual({ serialCurrent: null, serialLimit: null });
  });

  it('reads grader and grade', () => {
    expect(parseGrade('2020-21 Mosaic Silver LaMelo Ball BGS NM-MT+ 8.5')).toEqual({ grader: 'BGS', grade: '8.5' });
    expect(parseGrade('2019 Prizm Zion Williamson PSA 10')).toEqual({ grader: 'PSA', grade: '10' });
    expect(parseGrade('2019 Prizm Zion Williamson')).toEqual({ grader: null, grade: null });
  });

  it('flags rookie, autograph and relic wording', () => {
    expect(parseTitleFields('2022 Chronicles #LM-JLR Jake LaRavia Rookie Card Patch Autograph')).toMatchObject({
      isRookie: true,
      isAutograph: true,
      isRelic: true,
      cardNumber: 'LM-JLR',
    });
    expect(parseTitleFields('2023-24 Panini Prizm #12 LeBron James')).toMatchObject({
      isRookie: false,
      isAutograph: false,
      isRelic: false,
    });
  });
});

describe('listing evidence', () => {
  it('keeps the store tags and product type and drops housekeeping tags', () => {
    const evidence = buildListingEvidence({
      source: 'dimecity',
      title: 'Panini Prizm 2019-20 Green Prizm',
      description: '<p>Pony 2019-20 <b>Green</b> Prizm&nbsp;</p>',
      raw_latest_payload: {
        tags: ['NBA', 'Single', '190625', 'in-stock', 'afterpay1903test'],
        vendor: 'Dime City Sports Cards',
        product_type: 'Kristaps Porzingis',
      },
    });

    expect(evidence).toEqual({
      store: 'dimecity',
      title: 'Panini Prizm 2019-20 Green Prizm',
      tags: ['NBA'],
      vendor: 'Dime City Sports Cards',
      productType: 'Kristaps Porzingis',
      description: 'Pony 2019-20 Green Prizm',
    });
    expect(titleOnlyEvidence(evidence)).toMatchObject({ tags: [], productType: null, description: null });
  });

  it('changes the evidence hash when the evidence or the classifier version changes', () => {
    const evidence = buildListingEvidence({ source: 's', title: 'A', raw_latest_payload: { tags: ['x y'] } });
    const retagged = buildListingEvidence({ source: 's', title: 'A', raw_latest_payload: { tags: ['x z'] } });
    expect(evidenceHash(evidence, 'v1')).toBe(evidenceHash(evidence, 'v1'));
    expect(evidenceHash(evidence, 'v1')).not.toBe(evidenceHash(retagged, 'v1'));
    expect(evidenceHash(evidence, 'v1')).not.toBe(evidenceHash(evidence, 'v2'));
  });
});

function testCatalogue(): CatalogueIndex {
  const card = (id: number, subsetId: number, cardNumber: string, playerName: string, isRookie = false) => ({
    id,
    subsetId,
    playerId: id + 1000,
    cardNumber,
    playerName,
    normalizedPlayerName: playerName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    isRookie,
  });
  const prizm: CatalogueProduct = {
    id: 1,
    season: '2023-24',
    brand: 'Panini',
    productLine: 'Prizm',
    aliases: ['prizm'],
    subsets: [
      {
        id: 10,
        productId: 1,
        name: 'Base Set',
        kind: 'base',
        parallels: [
          { id: 100, name: 'Silver Prizms', normalizedName: 'silver prizms', serialLimit: null },
          { id: 101, name: 'Blue Ice Prizms', normalizedName: 'blue ice prizms', serialLimit: 125 },
          { id: 102, name: 'Purple Prizms', normalizedName: 'purple prizms', serialLimit: 99 },
        ],
        cards: [card(1, 10, '136', 'Victor Wembanyama', true), card(2, 10, '12', 'P.J. Tucker'), card(3, 10, '50', 'Collin Sexton')],
      },
      {
        id: 11,
        productId: 1,
        name: 'Rookie Signatures',
        kind: 'autograph',
        parallels: [{ id: 110, name: 'Gold Prizms', normalizedName: 'gold prizms', serialLimit: 10 }],
        cards: [card(4, 11, '136', 'Victor Wembanyama', true)],
      },
      { id: 12, productId: 1, name: 'Base - Legends', kind: 'base', parallels: [], cards: [card(5, 12, '301', 'Kobe Bryant')] },
    ],
  };
  const optic: CatalogueProduct = {
    id: 2,
    season: '2023-24',
    brand: 'Panini',
    productLine: 'Donruss Optic',
    aliases: ['donruss optic', 'optic'],
    subsets: [{ id: 20, productId: 2, name: 'Base Set', kind: 'base', parallels: [], cards: [card(6, 20, '1', 'Victor Wembanyama', true)] }],
  };
  const donruss: CatalogueProduct = { id: 3, season: '2023-24', brand: 'Panini', productLine: 'Donruss', aliases: ['donruss'], subsets: [] };
  const olderPrizm: CatalogueProduct = { id: 4, season: '2022-23', brand: 'Panini', productLine: 'Prizm', aliases: ['prizm'], subsets: [] };
  return new CatalogueIndex({ products: [prizm, optic, donruss, olderPrizm] });
}

describe('catalogue candidates', () => {
  const catalogue = testCatalogue();

  it('joins initials so one name has one key', () => {
    expect(playerKey('P.J. Tucker')).toBe('pj tucker');
    expect(playerKey('PJ Tucker')).toBe('pj tucker');
    expect(playerKey('P J Tucker')).toBe('pj tucker');
    expect(playerKey('Victor Wembanyama')).toBe('victor wembanyama');
  });

  it('finds players named in a title, however the initials are written', () => {
    expect(catalogue.findPlayers(['2023-24 Panini Prizm #136 Victor Wembanyama RC']).map(player => player.name)).toEqual([
      'Victor Wembanyama',
    ]);
    expect(catalogue.findPlayers(['2023-24 Panini Prizm #12 PJ Tucker']).map(player => player.name)).toEqual(['P.J. Tucker']);
  });

  it('offers a near-miss when a store misspells a name, and nothing for an unrelated name', () => {
    expect(catalogue.findPlayers(['2023-24 Panini Prizm #50 Colin Sexton Cracked Ice']).map(player => player.name)).toEqual([
      'Collin Sexton',
    ]);
    expect(catalogue.findPlayers(['1991 Upper Deck #94 David Robinson'])).toEqual([]);
  });

  it('restricts products to the stated season and prefers the longest product name', () => {
    const found = catalogue.findProducts(['2023-24 Panini Donruss Optic #1 Victor Wembanyama'], ['2023-24']);
    // "Donruss" is only the start of "Donruss Optic", so the title names the more specific product.
    expect(found.map(product => product.productLine)).toEqual(['Donruss Optic']);
    expect(catalogue.findProducts(['2023-24 Panini Prizm #1'], ['2023-24']).map(product => product.id)).toEqual([1]);
    expect(catalogue.findProducts(['Panini Prizm Silver'], []).map(product => product.season)).toEqual(['2023-24', '2022-23']);
    expect(catalogue.findProducts(['2023-24 Panini Prizm EuroLeague'], ['2019-20'])).toEqual([]);
  });

  it('finds the product catalogued as "Elite" when the title says "Donruss Elite", without ambiguity', () => {
    const product = (id: number, season: string, productLine: string): CatalogueProduct => ({
      id, season, brand: 'Panini', productLine, aliases: productAliases(productLine), subsets: [],
    });
    // The alias comes from the catalogue: another season's "Donruss Elite" ends with this season's "Elite".
    const products = [product(1, '2021-22', 'Donruss'), product(2, '2021-22', 'Elite'), product(3, '2022-23', 'Donruss Elite')];
    generateProductAliases(products);
    const index = new CatalogueIndex({ products });

    expect(index.findProducts(['2021-22 Donruss Elite #141 Zion Williamson'], ['2021-22']).map(found => found.productLine)).toEqual(['Elite']);
    // A title that names only one of them still finds that one.
    expect(index.findProducts(['2021-22 Panini Donruss #1 Test Player'], ['2021-22']).map(found => found.productLine)).toEqual(['Donruss']);
  });

  it('generates aliases from the catalogue and never turns a parallel or a place into a product name', () => {
    const product = (id: number, productLine: string, extra: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
      id, season: '2023-24', brand: 'Panini', productLine, aliases: productAliases(productLine), subsets: [], ...extra,
    });
    const blackParallel = { id: 1, productId: 3, name: 'Black', kind: 'base', parallels: [{ id: 1, name: 'Black', normalizedName: 'black', serialLimit: null }], cards: [] };
    const products = [
      product(1, 'Donruss'),
      product(2, 'Donruss Optic', { sourceFile: '2023-24-Panini-Donruss-Optic-Basketball-Checklist.xlsx' }),
      product(3, 'Prizm'),
      product(4, 'Prizm Black', { subsets: [blackParallel] }),
      product(5, 'Court Kings'),
      product(6, 'Hoops', { sourceFile: '2023-24-Panini-NBA-Hoops-Basketball-Checklist.xlsx' }),
    ];
    generateProductAliases(products);
    const aliasesOf = (line: string): string[] => products.find(p => p.productLine === line)!.aliases;

    expect(aliasesOf('Donruss Optic')).toContain('optic');
    expect(aliasesOf('Hoops')).toContain('nba hoops'); // from the checklist file name
    expect(aliasesOf('Prizm Black')).not.toContain('black'); // a parallel name in the catalogue
    expect(aliasesOf('Court Kings')).not.toContain('kings'); // "Court" is not a product line
  });

  it('does not give two products the same short alias in one season', () => {
    const product = (id: number, productLine: string): CatalogueProduct => ({ id, season: '2023-24', brand: 'Panini', productLine, aliases: productAliases(productLine), subsets: [] });
    const products = [product(1, 'Donruss'), product(2, 'Donruss Optic'), product(3, 'Contenders'), product(4, 'Contenders Optic')];
    generateProductAliases(products);
    expect(products.find(p => p.productLine === 'Donruss Optic')!.aliases).not.toContain('optic');
    expect(products.find(p => p.productLine === 'Contenders Optic')!.aliases).not.toContain('optic');
  });

  it('narrows cards by number and player, trusting the player when they disagree', () => {
    const prizm = catalogue.product(1)!;
    expect(catalogue.findCards(prizm, '136', 'Victor Wembanyama').map(card => card.subsetId)).toEqual([10, 11]);
    expect(catalogue.findCards(prizm, '12', 'PJ Tucker').map(card => card.id)).toEqual([2]);
    expect(catalogue.findCards(prizm, '999', 'Collin Sexton').map(card => card.id)).toEqual([3]);
    expect(catalogue.findCards(prizm, '301', null).map(card => card.playerName)).toEqual(['Kobe Bryant']);
    expect(catalogue.findCards(prizm, null, null)).toEqual([]);
  });

  it('gives base sub-blocks the base set parallels', () => {
    expect(catalogue.parallelsFor(catalogue.subset(12)!).map(parallel => parallel.id)).toEqual([100, 101, 102]);
    expect(catalogue.parallelsFor(catalogue.subset(11)!).map(parallel => parallel.id)).toEqual([110]);
  });

  it('takes person-like names from store tags and product type, not teams or housekeeping', () => {
    expect(storeProvidedNames(['Chicago Bulls', 'Michael Jordan', 'Raw'], null)).toEqual(['Michael Jordan']);
    expect(storeProvidedNames(['NBA', 'Single'], 'Kristaps Porzingis')).toEqual(['Kristaps Porzingis']);
    expect(storeProvidedNames(['SPORT_Basketball', 'BRAND_Panini', 'Seattle Super Sonics'], null)).toEqual([]);
  });

  it('proposes capitalised runs in a title as possible names, leaving out card vocabulary', () => {
    const spans = titleNameSpans('1991 Upper Deck #94 David Robinson Spurs Checklist');
    expect(spans).toContain('David Robinson');
    expect(spans).not.toContain('Upper Deck');
    expect(titleNameSpans('2023-24 Prizm EuroLeague FERNANDO SAN EMETERIO Blue Ice /125 #188')).toContain('FERNANDO SAN EMETERIO');
  });
});

describe('classifier decisions made in code', () => {
  it('maps option labels back to catalogue entries and keeps reserved options', () => {
    const options = buildOptions(
      [{ name: 'Base' }, { name: 'Silver' }, { name: 'Silver' }],
      item => item.name,
      () => null,
      { base: 'standard version', unknown: 'not listed' },
      10
    );
    expect(Object.keys(options.criteria)).toEqual(['Base (listed)', 'Silver', 'base', 'unknown']);
    expect(options.byLabel.get('Silver')).toEqual({ name: 'Silver' });
  });

  it('restricts parallels to the print run stated in the title', () => {
    const parallels = testCatalogue().subset(10)!.parallels;
    expect(parallelsMatchingSerial(parallels, 125).map(parallel => parallel.name)).toEqual(['Blue Ice Prizms']);
    expect(parallelsMatchingSerial(parallels, null)).toHaveLength(3);
    expect(parallelsMatchingSerial(parallels, 7)).toHaveLength(3);
  });

  it('rules out autograph and memorabilia subsets when the title has no such wording', () => {
    const catalogue = testCatalogue();
    const subsets = [catalogue.subset(10)!, catalogue.subset(11)!];
    expect(subsetsConsistentWithTitle(subsets, { isAutograph: false, isRelic: false }).map(subset => subset.id)).toEqual([10]);
    expect(subsetsConsistentWithTitle(subsets, { isAutograph: true, isRelic: false }).map(subset => subset.id)).toEqual([10, 11]);
    expect(subsetsConsistentWithTitle([catalogue.subset(11)!], { isAutograph: false, isRelic: false })).toHaveLength(1);
  });
});

/** A Jev stand-in that answers each Choice with a scripted option, or the last option when unscripted. */
function scriptedJev(script: Record<string, { choice: string; confidence?: number }>): JevClient & { asked: Array<Record<string, JevQuestion>> } {
  const asked: Array<Record<string, JevQuestion>> = [];
  return {
    asked,
    async ask(_state, questions): Promise<JevResponse> {
      asked.push(questions);
      const answers: JevResponse['answers'] = {};
      for (const [id, question] of Object.entries(questions)) {
        if (question.type !== 'choice') continue;
        const options = Object.keys(question.criteria);
        const scripted = script[id];
        const choice = scripted?.choice ?? options[options.length - 1]!;
        if (!options.includes(choice)) throw new Error(`"${choice}" was not offered for ${id}: ${options.join(', ')}`);
        answers[id] = { type: 'choice', choice, confidence: scripted?.confidence ?? 1, probabilities: { [choice]: 1 } };
      }
      return { model: 'jev-test', answers, usage: { input_tokens: 100, output_tokens: 0 } };
    },
  };
}

function evidence(title: string, overrides: Partial<ListingEvidence> = {}): ListingEvidence {
  return { store: 'test', title, tags: [], vendor: null, productType: null, description: null, ...overrides };
}

describe('classifyListing', () => {
  const catalogue = testCatalogue();

  it('resolves a basketball single to a catalogue card and parallel', async () => {
    const jev = scriptedJev({
      item_type: { choice: 'single_card' },
      sport: { choice: 'basketball' },
      player: { choice: 'Victor Wembanyama' },
      product: { choice: '2023-24 Panini Prizm' },
      parallel: { choice: 'Blue Ice Prizms /125' },
    });

    const result = await classifyListing(evidence('2023-24 Panini Prizm #136 Victor Wembanyama Blue Ice /125 RC'), catalogue, jev);

    expect(result.reviewStatus).toBe('accepted');
    expect(result).toMatchObject({ playerName: 'Victor Wembanyama', playerSource: 'catalogue', parallelStatus: 'matched' });
    expect(result.product?.id).toBe(1);
    // The autograph subset shares the number and player but the title has no autograph wording.
    expect(result.subset?.id).toBe(10);
    expect(result.card?.id).toBe(1);
    expect(result.parallel?.id).toBe(101);
    expect(result.isRookie).toBe(true);
    expect(jev.asked).toHaveLength(2);
    // Only the parallel numbered to 125 is offered, alongside the reserved options.
    expect(Object.keys((jev.asked[1]!.parallel as { criteria: Record<string, unknown> }).criteria)).toEqual([
      'Blue Ice Prizms /125',
      'base',
      'unknown',
    ]);
  });

  it('stops after one request for anything that is not a basketball single', async () => {
    const jev = scriptedJev({ item_type: { choice: 'sealed_product' }, sport: { choice: 'basketball' } });

    const result = await classifyListing(evidence('2024-25 Panini Select Basketball Mega Box'), catalogue, jev);

    expect(result).toMatchObject({ itemType: 'sealed_product', reviewStatus: 'out_of_scope', playerName: null });
    expect(jev.asked).toHaveLength(1);
  });

  it('does not act on a low-confidence hint; with no catalogue product the listing is unmatched', async () => {
    const jev = scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'soccer', confidence: 0.4 } });

    const result = await classifyListing(evidence('2023 Panini Select Lime Green Premier 009/499'), catalogue, jev);

    expect(result.reviewStatus).toBe('unmatched');
    expect(result.reviewReasons).toEqual(expect.arrayContaining(['product_not_in_catalogue', 'no_player']));
  });

  it('keeps a store-published name for a player the catalogue does not know, but never accepts it (D-005)', async () => {
    const jev = scriptedJev({
      item_type: { choice: 'single_card' },
      sport: { choice: 'basketball' },
      player: { choice: 'Rolando Blackman' },
    });

    const result = await classifyListing(
      evidence('1991 Upper Deck #87 Checklist', { tags: ['Dallas Mavericks', 'Raw', 'Rolando Blackman'] }),
      catalogue,
      jev
    );

    expect(result).toMatchObject({
      playerName: 'Rolando Blackman',
      playerSource: 'store',
      playerId: null,
      reviewStatus: 'unmatched',
      grounded: false,
      card: null,
      isAutograph: null,
    });
    expect(result.reviewReasons).toContain('product_not_in_catalogue');
    expect(result.matchedFields).toEqual([]);
  });

  it('falls back to a name span in the title for the watchlist section, but the listing stays unmatched', async () => {
    const jev = scriptedJev({
      item_type: { choice: 'single_card' },
      sport: { choice: 'basketball' },
      player_span: { choice: 'DAVID ROBINSON' },
    });

    const result = await classifyListing(evidence('1991 Upper Deck #94 DAVID ROBINSON Spurs Checklist'), catalogue, jev);

    expect(result).toMatchObject({ playerName: 'David Robinson', playerSource: 'title', reviewStatus: 'unmatched' });
  });

  it('derives the player from the card number when the title names nobody, and caps the result at Possible', async () => {
    const jev = scriptedJev({
      item_type: { choice: 'single_card' },
      sport: { choice: 'basketball' },
      parallel: { choice: 'base' },
    });

    const result = await classifyListing(evidence('2023-24 Panini Prizm #301'), catalogue, jev);

    expect(result).toMatchObject({ playerName: 'Kobe Bryant', playerSource: 'checklist', parallelStatus: 'base', reviewStatus: 'possible' });
    expect(result.reviewReasons).toContain('player_derived_from_card_number');
    expect(result.subset?.id).toBe(12);
  });

  it('leaves a basketball single with no identifiable player unmatched', async () => {
    const jev = scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' } });

    const result = await classifyListing(evidence('1996 Upper Deck Space Jam #JS3'), catalogue, jev);

    expect(result.reviewStatus).toBe('unmatched');
    expect(result.reviewReasons).toContain('no_player');
  });
});

describe('classifyListing: rules decide acceptance, the model only tie-breaks (D-006)', () => {
  const catalogue = testCatalogue();
  const listing = '2023-24 Panini Prizm #136 Victor Wembanyama';

  it('accepts a title whose product, number and player agree with a catalogue row, without asking the model about them', async () => {
    const jev = scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' }, parallel: { choice: 'base' } });

    const result = await classifyListing(evidence(listing), catalogue, jev);

    expect(result.reviewStatus).toBe('accepted');
    expect(result.card?.id).toBe(1);
    expect(result.matchedFields).toEqual(expect.arrayContaining(['product', 'player', 'card_number', 'subset']));
    expect(result.matcherVersion).toBe(JEV_CLASSIFIER_VERSION);
    // The player and the product each had one exact candidate, so neither was put to the model.
    expect(Object.keys(jev.asked[0]!)).toEqual(['item_type', 'sport']);
  });

  it('takes sport and item type from the matched row, whatever the model hinted (fixture 1)', async () => {
    const jev = scriptedJev({
      item_type: { choice: 'single_card' },
      sport: { choice: 'soccer', confidence: 0.43 },
      parallel: { choice: 'base' },
    });

    const result = await classifyListing(evidence(listing), catalogue, jev);

    expect(result).toMatchObject({ reviewStatus: 'accepted', sport: 'basketball', itemType: 'single_card', grounded: true });
    // What the model said is still recorded, apart from what the catalogue confirmed.
    expect(result.hints).toMatchObject({ sport: 'soccer', sportConfidence: 0.43 });
  });

  it('does not accept a confident model answer when no catalogue row exists (fixture 3)', async () => {
    const jev = scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball', confidence: 1 } });

    const result = await classifyListing(
      evidence('2025 Topps Bowman Chrome #BCP-10 Victor Wembanyama Reptilian Refractor'),
      catalogue,
      jev
    );

    expect(result.reviewStatus).toBe('unmatched');
    expect(result.card).toBeNull();
    expect(result.reviewReasons).toContain('product_not_in_catalogue');
  });

  it('is unmatched with card_number_conflict, and records no product, when the number is not a card of this player (founder decision)', async () => {
    const jev = scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' } });

    const result = await classifyListing(evidence('2023-24 Panini Prizm #999 Victor Wembanyama'), catalogue, jev);

    expect(result.reviewStatus).toBe('unmatched');
    expect(result.reviewReasons).toContain('card_number_conflict');
    // A wrong product guess is a bad match, so none is kept; the player is, for the watchlist section.
    expect(result).toMatchObject({ product: null, card: null, subset: null, grounded: false, playerName: 'Victor Wembanyama' });
    expect(result.matchedFields).toEqual([]);
    expect(result.matchReasons.join(' ')).not.toMatch(/Product 2023-24/);
  });

  it('treats a number that belongs to a different player in the product as a conflict too', async () => {
    const jev = scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' } });

    // #12 is P.J. Tucker's card in the test Prizm product, not Wembanyama's.
    const result = await classifyListing(evidence('2023-24 Panini Prizm #12 Victor Wembanyama'), catalogue, jev);

    expect(result).toMatchObject({ reviewStatus: 'unmatched', product: null });
    expect(result.reviewReasons).toContain('card_number_conflict');
  });

  it('does not let a confident hint for another sport rule out a listing that names a known NBA player (founder decision)', async () => {
    const jev = scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'soccer', confidence: 0.95 } });

    const named = await classifyListing(evidence('Victor Wembanyama Premier League Edition Card'), catalogue, jev);
    expect(named.reviewStatus).toBe('unmatched');
    expect(named.hints).toMatchObject({ sport: 'soccer', sportConfidence: 0.95 });

    // The same hint with nobody named is positive evidence, so the listing is out of scope.
    const unnamed = await classifyListing(evidence('2024 Premier League Edition Card'), catalogue, jev);
    expect(unnamed.reviewStatus).toBe('out_of_scope');

    // A known player in a store tag counts the same as one in the title.
    const tagged = await classifyListing(evidence('Premier League Edition Card', { tags: ['Victor Wembanyama'] }), catalogue, jev);
    expect(tagged.reviewStatus).toBe('unmatched');
  });

  it('is Possible when the title has no card number', async () => {
    const jev = scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' } });

    const result = await classifyListing(evidence('2023-24 Panini Prizm Victor Wembanyama Silver'), catalogue, jev);

    expect(result.reviewStatus).toBe('possible');
    expect(result.reviewReasons).toContain('no_card_number');
  });

  it('reports autograph status as unknown without a matched row, and from the subset kind with one', async () => {
    const unmatched = await classifyListing(
      evidence('1991 Upper Deck #87 Silver Signature Rolando Blackman', { tags: ['Rolando Blackman'] }),
      catalogue,
      scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' }, player: { choice: 'Rolando Blackman' } })
    );
    expect(unmatched.isAutograph).toBeNull();
    expect(unmatched.fields.isAutograph).toBe(true);

    const matched = await classifyListing(
      evidence('2023-24 Panini Prizm #136 Victor Wembanyama Rookie Signatures Auto'),
      catalogue,
      scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' }, subset: { choice: 'Rookie Signatures' }, parallel: { choice: 'base' } })
    );
    expect(matched).toMatchObject({ reviewStatus: 'accepted', isAutograph: true });
    expect(matched.subset?.kind).toBe('autograph');
  });

  it('does not call a signature word an autograph when the matched row is a base card, and leaves it unknown if no row is chosen', async () => {
    const result = await classifyListing(
      evidence('2023-24 Panini Prizm #136 Victor Wembanyama Silver Signature'),
      catalogue,
      scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' }, subset: { choice: 'Base Set' }, parallel: { choice: 'Silver Prizms' } })
    );

    expect(result.fields.isAutograph).toBe(true);
    expect(result.isAutograph).toBe(false);

    // If the model cannot choose between the base and autograph subsets, the answer is unknown, not "yes".
    const undecided = await classifyListing(
      evidence('2023-24 Panini Prizm #136 Victor Wembanyama Silver Signature'),
      catalogue,
      scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' }, parallel: { choice: 'Silver Prizms' } })
    );
    expect(undecided).toMatchObject({ reviewStatus: 'possible', isAutograph: null });
    expect(undecided.reviewReasons).toContain('subset_unresolved');
  });

  it('records a rejected candidate as such, not as "not in catalogue" (fixture 9)', async () => {
    // "Prizm" alone matches two seasons' products when the title states no season.
    const jev = scriptedJev({
      item_type: { choice: 'single_card' },
      sport: { choice: 'basketball' },
      player: { choice: 'Victor Wembanyama' },
      product: { choice: 'none_of_these', confidence: 0.9 },
    });

    const result = await classifyListing(evidence('Panini Prizm Victor Wembanyama Silver'), catalogue, jev);

    expect(result.reviewStatus).toBe('unmatched');
    expect(result.reviewReasons).toContain('product_candidate_rejected');
    expect(result.reviewReasons).not.toContain('product_not_in_catalogue');
  });

  it('rules a listing out of scope only on positive evidence, never on absence from the catalogue', async () => {
    const box = await classifyListing(
      evidence('2024-25 Panini Select Basketball Mega Box'),
      catalogue,
      scriptedJev({ item_type: { choice: 'sealed_product', confidence: 0.95 }, sport: { choice: 'basketball' } })
    );
    expect(box.reviewStatus).toBe('out_of_scope');

    const gap = await classifyListing(
      evidence('2007 Topps #21 Kevin Garnett Luxury Box', { tags: ['Kevin Garnett'] }),
      catalogue,
      scriptedJev({ item_type: { choice: 'sealed_product', confidence: 0.47 }, sport: { choice: 'basketball' }, player: { choice: 'Kevin Garnett' } })
    );
    expect(gap.reviewStatus).toBe('unmatched');
  });

  it('widens the season by one when the card is not in the stated year, and says so (fixture 19)', async () => {
    const row = (id: number, subsetId: number, cardNumber: string, playerName: string) => ({
      id,
      subsetId,
      playerId: id + 1000,
      cardNumber,
      playerName,
      normalizedPlayerName: playerName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
      isRookie: false,
    });
    const wide = new CatalogueIndex({
      products: [
        {
          id: 50, season: '2020-21', brand: 'Panini', productLine: 'Hoops', aliases: ['hoops'],
          subsets: [{ id: 500, productId: 50, name: 'Base Set', kind: 'base', parallels: [], cards: [row(500, 500, '20', 'Aron Baynes')] }],
        },
        {
          id: 51, season: '2021-22', brand: 'Panini', productLine: 'Hoops', aliases: ['hoops'],
          subsets: [
            { id: 510, productId: 51, name: 'Skyview', kind: 'insert', parallels: [], cards: [row(510, 510, '20', 'Ja Morant')] },
            { id: 511, productId: 51, name: 'Base Set', kind: 'base', parallels: [], cards: [row(511, 511, '20', 'Bam Adebayo')] },
          ],
        },
      ],
    });

    const result = await classifyListing(
      evidence('2020-21 Panini Hoops #20 Ja Morant Sky View'),
      wide,
      scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' } })
    );

    expect(result).toMatchObject({ reviewStatus: 'possible', yearWidened: '2020-21 -> 2021-22' });
    expect(result.product?.season).toBe('2021-22');
    expect(result.subset?.name).toBe('Skyview');
    expect(result.reviewReasons).toContain('year_widened');
  });
});

describe('Jev client', () => {
  const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

  it('requires an API key', () => {
    const saved = { key: process.env.TYPESAFE_KEY, apiKey: process.env.TYPESAFE_API_KEY };
    delete process.env.TYPESAFE_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      expect(() => createJevClient()).toThrow('TYPESAFE_KEY is required');
    } finally {
      if (saved.key !== undefined) process.env.TYPESAFE_KEY = saved.key;
      if (saved.apiKey !== undefined) process.env.TYPESAFE_API_KEY = saved.apiKey;
    }
  });

  it('retries rate limits and overloads, then returns the answer', async () => {
    const statuses = [429, 529];
    const fetchImpl = jest.fn(async () => {
      const status = statuses.shift();
      return status ? new Response('busy', { status }) : ok({ model: 'jev-1', answers: {}, usage: { input_tokens: 1, output_tokens: 0 } });
    });
    const client = createJevClient({ apiKey: 'k', fetchImpl, sleep: async () => undefined });

    await expect(client.ask('state', {})).resolves.toMatchObject({ model: 'jev-1' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry a rejected request', async () => {
    const fetchImpl = jest.fn(async () => new Response('bad question', { status: 422 }));
    const client = createJevClient({ apiKey: 'k', fetchImpl, sleep: async () => undefined });

    await expect(client.ask('state', {})).rejects.toThrow('HTTP 422');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('card numbers are compared for format, not relaxed (CAR-92)', () => {
  it('agrees across case, hyphens, spaces, leading zeros and the subset prefix a seller copies', () => {
    expect(cardNumbersAgree('ss-26', 'SS-26', 'Signature Selections')).toBe(true);
    expect(cardNumbersAgree('RS-DOT', 'RS DOT', 'Rookie Signatures')).toBe(true);
    expect(cardNumbersAgree('007', '7', 'Base Set')).toBe(true);
    expect(cardNumbersAgree('80B2-AD', '80B2AD', 'Bowman Chrome')).toBe(true);
    // The prefix is the initials of the subset; the number the checklist prints has no prefix.
    expect(cardNumbersAgree('SS-26', '26', 'Signature Selections')).toBe(true);
    expect(cardNumbersAgree('SS-026', '26', 'Signature Selections')).toBe(true);
  });

  it('still disagrees when the number is different', () => {
    expect(cardNumbersAgree('SS-26', '27', 'Signature Selections')).toBe(false);
    // Right number, but the prefix is not that subset's initials: another subset's card.
    expect(cardNumbersAgree('DD-26', '26', 'Signature Selections')).toBe(false);
    // A bare number never matches a prefixed one by dropping the prefix: that would guess the subset.
    expect(cardNumbersAgree('26', 'SS-26', 'Signature Selections')).toBe(false);
    expect(cardNumbersAgree('12', '120', 'Base Set')).toBe(false);
    expect(cardNumbersAgree('A1', 'A2', 'Base Set')).toBe(false);
    expect(cardNumbersAgree('5', null, 'Base Set')).toBe(false);
  });
});

describe('a title that names a subset chooses it (CAR-92)', () => {
  const subset = (id: number, name: string): CatalogueSubset => ({ id, productId: 1, name, kind: 'base', parallels: [], cards: [] });
  const fields = { isAutograph: false, isRelic: false };

  it('picks the one subset whose distinctive name is in the title', () => {
    const subsets = [subset(1, 'Base Season Ticket'), subset(2, 'Ticket Stub')];
    expect(subsetsConsistentWithTitle(subsets, fields, '2023-24 Panini Contenders #47 Aaron Gordon Season Ticket').map(s => s.name)).toEqual(['Base Season Ticket']);
  });

  it('keeps all candidates when the title names none, or more than one, of them', () => {
    const subsets = [subset(1, 'Base Set'), subset(2, 'Rookie Variations')];
    expect(subsetsConsistentWithTitle(subsets, fields, '2024-25 Panini Revolution #121 Bub Carrington').map(s => s.name)).toEqual(['Base Set', 'Rookie Variations']);
    const both = [subset(1, 'Silver'), subset(2, 'Silver Wave')];
    expect(subsetsConsistentWithTitle(both, fields, 'Silver Wave #1 Test Player').map(s => s.name)).toEqual(['Silver', 'Silver Wave']);
  });
});
