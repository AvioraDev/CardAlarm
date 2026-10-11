import fs from 'fs';
import path from 'path';
import { normalizeCatalogueName } from '../src/catalogue/checklist-parser';
import { CatalogueIndex, productAliases, type CatalogueProduct } from '../src/classify/catalogue-index';
import { classifyListing, JEV_CLASSIFIER_VERSION, type ListingClassification } from '../src/classify/classifier';
import type { ListingEvidence } from '../src/classify/evidence';
import type { JevClient, JevQuestion, JevResponse } from '../src/classify/jev-client';

/**
 * CAR-78 / CAR-87: the 20 real listings from the matcher analysis, run through the real classifier against a
 * snapshot of the real catalogue rows they touch. The model is stubbed, so the test is offline. Where the
 * stub is told to repeat an error the production model actually made (fixtures 1, 2 and 3), the test shows
 * the rules do not let it through.
 *
 * Expected outcomes live in fixtures/matcher-fixtures.json (verified against the catalogue on 2026-10-12).
 */

interface Fixture {
  fixture: number;
  storeProductId: number;
  input: { store: string; title: string; description: string; tags: string[]; productType: string | null; vendor: string | null };
  expected: {
    outcome: 'confirmed' | 'possible' | 'unmatched';
    product: { season: string; productLine: string } | null;
    subset: { name: string; kind: string } | null;
    cardNumber: string | null;
    players: Array<{ name: string }>;
    parallel: { name: string | null; status: string };
    isAutograph: boolean | string | null;
  };
}

const fixtures: Fixture[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/matcher-fixtures.json'), 'utf8')).fixtures;
const snapshot: { products: Array<Omit<CatalogueProduct, 'aliases'>> } = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/catalogue-snapshot.json'), 'utf8')
);
const catalogue = new CatalogueIndex({
  products: snapshot.products.map(product => ({ ...product, aliases: productAliases(product.productLine) })),
});

const words = (value: string): string[] => normalizeCatalogueName(value).split(' ').filter(Boolean);

/** Where the real model's hints were wrong, the stub repeats them (read from the stored raw_signals). */
const HINT_OVERRIDES: Record<number, { item?: [string, number]; sport?: [string, number] }> = {
  1: { sport: ['soccer', 0.43] },
  2: { item: ['sealed_product', 0.47] },
  3: { sport: ['basketball', 1] },
};

/** Choices where tokens alone cannot say which candidate a model would pick. */
const CHOICES: Record<number, { product?: string }> = {
  14: { product: '2020-21 Panini Donruss Optic' },
};

function stubFor(fixtureNumber: number, title: string, otherEvidence: string[]): JevClient {
  const titleWords = new Set(words(title));
  // The real model also reads tags, product type and description (the evidence state sent to it).
  const evidenceWords = new Set([...titleWords, ...otherEvidence.flatMap(words)]);
  return {
    async ask(_state, questions): Promise<JevResponse> {
      const answers: JevResponse['answers'] = {};
      for (const [id, question] of Object.entries(questions) as Array<[string, JevQuestion]>) {
        if (question.type !== 'choice') continue;
        const options = Object.keys(question.criteria);
        const real = options.filter(option => !['none_of_these', 'base', 'unknown'].includes(option));
        let choice = options[options.length - 1]!;
        let confidence = 1;

        if (id === 'item_type') {
          const [value, score] = HINT_OVERRIDES[fixtureNumber]?.item ?? ['single_card', 1];
          choice = value;
          confidence = score;
        } else if (id === 'sport') {
          const [value, score] = HINT_OVERRIDES[fixtureNumber]?.sport ?? ['basketball', 1];
          choice = value;
          confidence = score;
        } else if (id === 'player') {
          choice = real.find(option => words(option).every(word => evidenceWords.has(word))) ?? 'none_of_these';
        } else if (id === 'product') {
          choice =
            CHOICES[fixtureNumber]?.product ??
            [...real].sort((a, b) => words(b).filter(w => titleWords.has(w)).length - words(a).filter(w => titleWords.has(w)).length)[0] ??
            'none_of_these';
        } else if (id === 'subset') {
          choice = real.find(option => option === 'Base Set') ?? real[0] ?? 'none_of_these';
        } else if (id === 'parallel') {
          const covered = real
            .filter(option => {
              const name = option.replace(/\s*\/\d+$/, '');
              return words(name).every(word => titleWords.has(word) || word === 'prizms' || word === 'and');
            })
            .sort((a, b) => words(b).length - words(a).length);
          choice = covered[0] ?? 'base';
        }
        answers[id] = { type: 'choice', choice, confidence, probabilities: { [choice]: confidence } };
      }
      return { model: 'jev-test', answers, usage: { input_tokens: 100, output_tokens: 0 } };
    },
  };
}

async function classify(fixture: Fixture): Promise<ListingClassification> {
  const evidence: ListingEvidence = {
    store: fixture.input.store,
    title: fixture.input.title,
    tags: fixture.input.tags,
    vendor: fixture.input.vendor,
    productType: fixture.input.productType,
    description: fixture.input.description || null,
  };
  return classifyListing(
    evidence,
    catalogue,
    stubFor(fixture.fixture, fixture.input.title, [...fixture.input.tags, fixture.input.productType ?? '', fixture.input.description])
  );
}

const STATUS: Record<Fixture['expected']['outcome'], string> = { confirmed: 'accepted', possible: 'possible', unmatched: 'unmatched' };

// Fixtures whose subset or parallel the catalogue cannot yet express (see docs/architecture/checklist-importer-audit.md).
const SUBSET_NOT_EXPRESSIBLE = new Set([17]);
const PARALLEL_NOT_ASSERTED = new Set([7, 14, 17]);

describe('matcher fixtures (CAR-78): the 20 real listings', () => {
  it('covers all 20 fixtures: 10 confirmed, 2 possible, 8 unmatched', () => {
    expect(fixtures).toHaveLength(20);
    const count = (outcome: string) => fixtures.filter(f => f.expected.outcome === outcome).length;
    expect([count('confirmed'), count('possible'), count('unmatched')]).toEqual([10, 2, 8]);
  });

  it.each(fixtures.map(f => [f.fixture, f] as const))('fixture %i produces its expected outcome', async (_n, fixture) => {
    const result = await classify(fixture);
    const { expected } = fixture;

    expect(result.reviewStatus).toBe(STATUS[expected.outcome]);
    expect(result.matcherVersion).toBe(JEV_CLASSIFIER_VERSION);

    if (expected.outcome === 'unmatched') {
      // Nothing is asserted that the catalogue has not confirmed (D-005, D-006).
      expect(result.card).toBeNull();
      expect(result.product).toBeNull();
      expect(result.grounded).toBe(false);
      expect(result.isAutograph).toBeNull();
      expect(result.matchedFields).toEqual([]);
      expect(result.reviewReasons.length).toBeGreaterThan(0);
      return;
    }

    expect(result.product).toMatchObject({ season: expected.product!.season, productLine: expected.product!.productLine });
    expect(result.matchedFields).toEqual(expect.arrayContaining(['product', 'player']));
    expect(normalizeCatalogueName(result.playerName ?? '')).toBe(normalizeCatalogueName(expected.players[0]!.name));

    if (expected.outcome === 'confirmed') {
      expect(result.card?.cardNumber).toBe(expected.cardNumber);
      expect(result.matchedFields).toContain('card_number');
      expect(result.sport).toBe('basketball');
      expect(result.itemType).toBe('single_card');
      expect(result.matchReasons.length).toBeGreaterThan(0);
    }
    if (expected.subset && !SUBSET_NOT_EXPRESSIBLE.has(fixture.fixture)) {
      expect(result.subset?.name).toBe(expected.subset.name);
    }
    if (expected.parallel.status === 'matched' && !PARALLEL_NOT_ASSERTED.has(fixture.fixture)) {
      expect(normalizeCatalogueName(result.parallel?.name ?? '')).toBe(normalizeCatalogueName(expected.parallel.name!));
    }
    if (expected.parallel.status === 'none' && !PARALLEL_NOT_ASSERTED.has(fixture.fixture) && expected.outcome === 'confirmed') {
      expect(result.parallel).toBeNull();
    }
  });

  it('records why fixture 19 is only Possible: the seller year was a season off', async () => {
    const result = await classify(fixtures.find(f => f.fixture === 19)!);
    expect(result.yearWidened).toBe('2020-21 -> 2021-22');
    expect(result.reviewReasons).toContain('year_widened');
  });

  it('keeps the model out of the decision for fixtures 1, 2 and 3', async () => {
    // 1: the model said soccer at 0.43; the product, number and player still agree with a catalogue row.
    const one = await classify(fixtures.find(f => f.fixture === 1)!);
    expect(one).toMatchObject({ reviewStatus: 'accepted', sport: 'basketball' });
    expect(one.hints).toMatchObject({ sport: 'soccer', sportConfidence: 0.43 });

    // 2: the model said "sealed product" at 0.47; with no catalogue product it is a gap, never sealed, never accepted.
    const two = await classify(fixtures.find(f => f.fixture === 2)!);
    expect(two.reviewStatus).toBe('unmatched');
    expect(two.reviewReasons).toContain('product_not_in_catalogue');

    // 3: the model said basketball at 1.0 from a copied store field; with no catalogue product nothing is accepted.
    const three = await classify(fixtures.find(f => f.fixture === 3)!);
    expect(three.reviewStatus).toBe('unmatched');
    expect(three.card).toBeNull();
  });

  it('treats autograph as unknown for the Silver Signature listing (fixture 11)', async () => {
    const eleven = await classify(fixtures.find(f => f.fixture === 11)!);
    expect(eleven.fields.isAutograph).toBe(true); // the title word is still seen...
    expect(eleven.isAutograph).toBeNull(); // ...but it is not a fact without a matched row
  });
});
