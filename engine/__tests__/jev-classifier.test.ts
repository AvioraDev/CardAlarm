import {
  isSubsetSheet,
  parseParallelLine,
  parseSubsetSheet,
  productFromFileName,
} from '../src/catalogue/checklist-parser';
import {
  CatalogueIndex,
  playerKey,
  storeProvidedNames,
  titleNameSpans,
  type CatalogueProduct,
} from '../src/classify/catalogue-index';
import {
  buildOptions,
  classifyListing,
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
    expect(found.map(product => product.productLine)).toEqual(['Donruss Optic', 'Donruss']);
    expect(catalogue.findProducts(['2023-24 Panini Prizm #1'], ['2023-24']).map(product => product.id)).toEqual([1]);
    expect(catalogue.findProducts(['Panini Prizm Silver'], []).map(product => product.season)).toEqual(['2023-24', '2022-23']);
    expect(catalogue.findProducts(['2023-24 Panini Prizm EuroLeague'], ['2019-20'])).toEqual([]);
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

  it('sends a low-confidence triage decision to review instead of acting on it', async () => {
    const jev = scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'soccer', confidence: 0.4 } });

    const result = await classifyListing(evidence('2023 Panini Select Lime Green Premier 009/499'), catalogue, jev);

    expect(result.reviewStatus).toBe('needs_review');
    expect(result.reviewReasons).toContain('low_confidence_sport');
  });

  it('uses a store-published name for a player the catalogue does not know', async () => {
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

    expect(result).toMatchObject({ playerName: 'Rolando Blackman', playerSource: 'store', playerId: null, reviewStatus: 'accepted' });
    expect(result.reviewReasons).toContain('product_not_in_catalogue');
  });

  it('falls back to a name span in the title when no candidate is known', async () => {
    const jev = scriptedJev({
      item_type: { choice: 'single_card' },
      sport: { choice: 'basketball' },
      player_span: { choice: 'DAVID ROBINSON' },
    });

    const result = await classifyListing(evidence('1991 Upper Deck #94 DAVID ROBINSON Spurs Checklist'), catalogue, jev);

    expect(result).toMatchObject({ playerName: 'David Robinson', playerSource: 'title', reviewStatus: 'accepted' });
  });

  it('names the player from the card number when the title names nobody', async () => {
    const jev = scriptedJev({
      item_type: { choice: 'single_card' },
      sport: { choice: 'basketball' },
      product: { choice: '2023-24 Panini Prizm' },
      parallel: { choice: 'base' },
    });

    const result = await classifyListing(evidence('2023-24 Panini Prizm #301'), catalogue, jev);

    expect(result).toMatchObject({ playerName: 'Kobe Bryant', playerSource: 'checklist', parallelStatus: 'base', reviewStatus: 'accepted' });
    expect(result.subset?.id).toBe(12);
  });

  it('leaves a basketball single with no identifiable player in review', async () => {
    const jev = scriptedJev({ item_type: { choice: 'single_card' }, sport: { choice: 'basketball' } });

    const result = await classifyListing(evidence('1996 Upper Deck Space Jam #JS3'), catalogue, jev);

    expect(result.reviewStatus).toBe('needs_review');
    expect(result.reviewReasons).toContain('no_player');
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
