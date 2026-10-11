import { parseCsv, parseCsvObjects, toCsv } from '../src/accuracy/csv';
import {
  normalizeCardNumber,
  normalizeParallel,
  normalizeYear,
  scoreClassifier,
  type LabelledListing,
  type Prediction,
} from '../src/accuracy/scoring';

function label(id: number, overrides: Partial<LabelledListing> = {}): LabelledListing {
  return {
    storeProductId: id,
    itemType: 'single_card',
    sport: 'basketball',
    year: '2023-24',
    productLine: 'Prizm',
    player: 'Victor Wembanyama',
    cardNumber: '275',
    parallel: '',
    isRookie: 'yes',
    isAuto: '',
    serialLimit: '',
    ...overrides,
  };
}

function prediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    isBasketballSingle: true,
    year: '2023-24',
    productLine: 'Panini Prizm',
    player: 'Victor Wembanyama',
    cardNumber: '#275',
    parallel: null,
    isRookie: true,
    isAuto: false,
    serialLimit: null,
    ...overrides,
  };
}

describe('normalisation', () => {
  it('compares years by their first four digits', () => {
    expect(normalizeYear('2023-24')).toBe('2023');
    expect(normalizeYear('2023')).toBe('2023');
    expect(normalizeYear(null)).toBe('');
  });

  it('ignores # and leading zeros in card numbers', () => {
    expect(normalizeCardNumber('#007')).toBe('7');
    expect(normalizeCardNumber('rc-12')).toBe('RC-12');
  });

  it('treats blank, base and none as the base card', () => {
    expect(normalizeParallel('')).toBe('');
    expect(normalizeParallel('Base')).toBe('');
    expect(normalizeParallel('Silver Prizm')).toBe('silver prizm');
  });
});

describe('scoreClassifier', () => {
  it('scores a fully correct prediction as correct on every field and on identity', () => {
    const score = scoreClassifier('jev', [label(1)], new Map([[1, prediction()]]));

    expect(score.fields.player.precision).toBe(1);
    expect(score.fields.productLine.precision).toBe(1);
    expect(score.fields.cardNumber.precision).toBe(1);
    expect(score.identity.precision).toBe(1);
    expect(score.identity.accuracy).toBe(1);
  });

  it('counts a wrong card number against precision but a missing one only against recall', () => {
    const labels = [label(1), label(2), label(3)];
    const predictions = new Map<number, Prediction | null>([
      [1, prediction({ cardNumber: '999' })],
      [2, prediction({ cardNumber: null })],
      [3, prediction()],
    ]);
    const score = scoreClassifier('deterministic', labels, predictions);

    expect(score.fields.cardNumber.predictedCount).toBe(2);
    expect(score.fields.cardNumber.correct).toBe(1);
    expect(score.fields.cardNumber.precision).toBeCloseTo(0.5);
    expect(score.fields.cardNumber.recall).toBeCloseTo(1 / 3);
  });

  it('only counts identity precision where the classifier committed to a full identity', () => {
    const labels = [label(1), label(2), label(3)];
    const predictions = new Map<number, Prediction | null>([
      [1, prediction()],
      [2, prediction({ player: 'Someone Else' })],
      [3, prediction({ cardNumber: null })],
    ]);
    const score = scoreClassifier('jev', labels, predictions);

    expect(score.identity.committed).toBe(2);
    expect(score.identity.committedCorrect).toBe(1);
    expect(score.identity.precision).toBeCloseTo(0.5);
    expect(score.identity.accuracy).toBeCloseTo(1 / 3);
  });

  it('accepts a parallel named more fully than the label, but not a different parallel', () => {
    const labels = [label(1, { parallel: 'Silver' }), label(2, { parallel: 'Silver' }), label(3, { parallel: '' })];
    const predictions = new Map<number, Prediction | null>([
      [1, prediction({ parallel: 'Silver Prizm' })],
      [2, prediction({ parallel: 'Blue' })],
      [3, prediction({ parallel: 'Silver' })],
    ]);
    const score = scoreClassifier('jev', labels, predictions);

    expect(score.fields.parallel.correct).toBe(1);
    expect(score.fields.parallel.predictedCount).toBe(3);
  });

  it('reports listings the classifier never stored a row for, instead of scoring them wrong', () => {
    const labels = [label(1), label(2)];
    const score = scoreClassifier('jev', labels, new Map([[1, prediction()]]));

    expect(score.singles).toBe(2);
    expect(score.withoutRow).toBe(1);
    expect(score.identity.accuracy).toBe(1);
    expect(score.gate.falseNegative).toBe(1);
  });

  it('scores the basketball-single gate in both directions', () => {
    const labels = [label(1), label(2, { itemType: 'sealed', sport: 'basketball' }), label(3)];
    const predictions = new Map<number, Prediction | null>([
      [1, prediction()],
      [2, prediction()],
      [3, prediction({ isBasketballSingle: false })],
    ]);
    const { gate } = scoreClassifier('deterministic', labels, predictions);

    expect(gate.truePositive).toBe(1);
    expect(gate.falsePositive).toBe(1);
    expect(gate.falseNegative).toBe(1);
  });

  it('does not score fields for listings that are not basketball singles', () => {
    const labels = [label(1, { itemType: 'sealed' })];
    const score = scoreClassifier('jev', labels, new Map([[1, prediction()]]));

    expect(score.singles).toBe(0);
    expect(score.fields.player.predictedCount).toBe(0);
  });
});

describe('csv', () => {
  it('round-trips commas, quotes and newlines', () => {
    const rows = [['id', 'title'], ['1', 'Prizm, "Silver"\nRC']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('reads rows as objects keyed by the header and skips blank lines', () => {
    expect(parseCsvObjects('a,b\r\n1,2\r\n\r\n3,\r\n')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '' },
    ]);
  });
});
