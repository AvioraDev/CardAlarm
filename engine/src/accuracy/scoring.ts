/**
 * Scores classifiers against a hand-labelled set of listings (CAR-63).
 *
 * Pure functions only: no database, no I/O. The export and score scripts feed them.
 */

export type ClassifierName = 'deterministic' | 'jev';

/** One hand-labelled listing. Blank text means "none"; blank flags mean false. */
export interface LabelledListing {
  storeProductId: number;
  itemType: string;
  sport: string;
  year: string;
  productLine: string;
  player: string;
  cardNumber: string;
  /** Blank, "base" or "none" all mean the base card. */
  parallel: string;
  isRookie: string;
  isAuto: string;
  serialLimit: string;
}

/** What a classifier stored for a listing. Null means it stored no row at all. */
export interface Prediction {
  /** Whether the classifier considers this an NBA / basketball single. */
  isBasketballSingle: boolean;
  year: string | null;
  productLine: string | null;
  player: string | null;
  cardNumber: string | null;
  parallel: string | null;
  isRookie: boolean | null;
  isAuto: boolean | null;
  serialLimit: string | null;
}

export const SCORED_FIELDS = ['player', 'year', 'productLine', 'cardNumber', 'parallel', 'serialLimit', 'isRookie', 'isAuto'] as const;
export type ScoredField = (typeof SCORED_FIELDS)[number];

/** The fields that together identify a card. */
export const IDENTITY_FIELDS: ScoredField[] = ['player', 'year', 'productLine', 'cardNumber', 'parallel'];

const BRAND_WORDS = new Set(['panini', 'topps', 'upper', 'deck', 'nba', 'basketball', 'and', 'the']);
const BASE_WORDS = new Set(['', 'base', 'none', 'n a', 'na']);

function words(value: string | null | undefined): string[] {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function text(value: string | null | undefined): string {
  return words(value).join(' ');
}

export function normalizeYear(value: string | null | undefined): string {
  const match = /\d{4}/.exec(value ?? '');
  return match ? match[0] : '';
}

export function normalizeCardNumber(value: string | null | undefined): string {
  const cleaned = (value ?? '').toUpperCase().replace(/[#\s]/g, '');
  return /^\d+$/.test(cleaned) ? String(Number(cleaned)) : cleaned;
}

function normalizeProductLine(value: string | null | undefined): string {
  return words(value)
    .filter(word => !BRAND_WORDS.has(word))
    .join(' ');
}

export function normalizeParallel(value: string | null | undefined): string {
  const joined = text(value);
  return BASE_WORDS.has(joined) ? '' : joined;
}

function normalizeSerialLimit(value: string | null | undefined): string {
  return /\d+/.exec(value ?? '')?.[0] ?? '';
}

export function parseFlag(value: string | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  return ['y', 'yes', 'true', '1', 'x'].includes((value ?? '').trim().toLowerCase());
}

/** "Silver" and "Silver Prizm" name the same parallel; "Silver" and "Blue" do not. */
function parallelsMatch(truth: string, predicted: string): boolean {
  if (truth === predicted) return true;
  if (!truth || !predicted) return false;
  const a = new Set(truth.split(' '));
  const b = new Set(predicted.split(' '));
  const subset = (small: Set<string>, large: Set<string>) => [...small].every(word => large.has(word));
  return subset(a, b) || subset(b, a);
}

function truthValue(label: LabelledListing, field: ScoredField): string {
  switch (field) {
    case 'player': return text(label.player);
    case 'year': return normalizeYear(label.year);
    case 'productLine': return normalizeProductLine(label.productLine);
    case 'cardNumber': return normalizeCardNumber(label.cardNumber);
    case 'parallel': return normalizeParallel(label.parallel);
    case 'serialLimit': return normalizeSerialLimit(label.serialLimit);
    case 'isRookie': return parseFlag(label.isRookie) ? 'true' : '';
    case 'isAuto': return parseFlag(label.isAuto) ? 'true' : '';
  }
}

function predictedValue(prediction: Prediction | null, field: ScoredField): string {
  if (!prediction) return '';
  switch (field) {
    case 'player': return text(prediction.player);
    case 'year': return normalizeYear(prediction.year);
    case 'productLine': return normalizeProductLine(prediction.productLine);
    case 'cardNumber': return normalizeCardNumber(prediction.cardNumber);
    case 'parallel': return normalizeParallel(prediction.parallel);
    case 'serialLimit': return normalizeSerialLimit(prediction.serialLimit);
    case 'isRookie': return prediction.isRookie ? 'true' : '';
    case 'isAuto': return prediction.isAuto ? 'true' : '';
  }
}

function fieldCorrect(label: LabelledListing, prediction: Prediction | null, field: ScoredField): boolean {
  const truth = truthValue(label, field);
  const predicted = predictedValue(prediction, field);
  return field === 'parallel' ? parallelsMatch(truth, predicted) : truth === predicted;
}

export function isLabelledBasketballSingle(label: LabelledListing): boolean {
  return text(label.itemType).replace(/ /g, '_') === 'single_card' && text(label.sport) === 'basketball';
}

export interface FieldScore {
  /** Labelled singles where the true value is non-empty. */
  truthCount: number;
  /** Singles where the classifier produced a non-empty value. */
  predictedCount: number;
  /** Non-empty predictions that equal the truth. */
  correct: number;
  /** correct / predictedCount. When the classifier says something, how often is it right. */
  precision: number | null;
  /** correct / truthCount. How much of what is really there it found. */
  recall: number | null;
}

export interface GateScore {
  /** Listings both the labels and the classifier call a basketball single. */
  truePositive: number;
  /** Classifier says basketball single, labels say no. */
  falsePositive: number;
  /** Labels say basketball single, classifier does not. */
  falseNegative: number;
  precision: number | null;
  recall: number | null;
}

export interface ClassifierScore {
  classifier: ClassifierName;
  /** Labelled singles scored. */
  singles: number;
  /** Singles for which this classifier stored no row at all (for example Jev has not run on them yet). */
  withoutRow: number;
  gate: GateScore;
  fields: Record<ScoredField, FieldScore>;
  identity: {
    /** Singles where every identity field is right. */
    allCorrect: number;
    /** correct over all labelled singles that have a row. */
    accuracy: number | null;
    /** Singles where the classifier committed to a player, card number and product line. */
    committed: number;
    /** Of those, how many have the whole identity right. This is the figure the 95% Current bar maps to. */
    committedCorrect: number;
    precision: number | null;
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function scoreClassifier(
  classifier: ClassifierName,
  labels: LabelledListing[],
  predictions: Map<number, Prediction | null>,
): ClassifierScore {
  const fields = Object.fromEntries(
    SCORED_FIELDS.map(field => [field, { truthCount: 0, predictedCount: 0, correct: 0, precision: null, recall: null } as FieldScore]),
  ) as Record<ScoredField, FieldScore>;
  const gate = { truePositive: 0, falsePositive: 0, falseNegative: 0 };
  let singles = 0;
  let withoutRow = 0;
  let scoredSingles = 0;
  let allCorrect = 0;
  let committed = 0;
  let committedCorrect = 0;

  for (const label of labels) {
    const prediction = predictions.get(label.storeProductId) ?? null;
    const truthIsSingle = isLabelledBasketballSingle(label);
    const predictedIsSingle = prediction?.isBasketballSingle === true;

    if (prediction) {
      if (truthIsSingle && predictedIsSingle) gate.truePositive += 1;
      if (!truthIsSingle && predictedIsSingle) gate.falsePositive += 1;
    }
    if (truthIsSingle && !predictedIsSingle) gate.falseNegative += 1;

    if (!truthIsSingle) continue;
    singles += 1;
    if (!prediction) {
      withoutRow += 1;
      continue;
    }
    scoredSingles += 1;

    for (const field of SCORED_FIELDS) {
      const truth = truthValue(label, field);
      const predicted = predictedValue(prediction, field);
      const score = fields[field];
      if (truth) score.truthCount += 1;
      if (predicted) score.predictedCount += 1;
      if (predicted && fieldCorrect(label, prediction, field)) score.correct += 1;
    }

    const identityRight = IDENTITY_FIELDS.every(field => fieldCorrect(label, prediction, field));
    if (identityRight) allCorrect += 1;
    if (predictedValue(prediction, 'player') && predictedValue(prediction, 'cardNumber') && predictedValue(prediction, 'productLine')) {
      committed += 1;
      if (identityRight) committedCorrect += 1;
    }
  }

  for (const field of SCORED_FIELDS) {
    const score = fields[field];
    score.precision = ratio(score.correct, score.predictedCount);
    score.recall = ratio(score.correct, score.truthCount);
  }

  return {
    classifier,
    singles,
    withoutRow,
    gate: {
      ...gate,
      precision: ratio(gate.truePositive, gate.truePositive + gate.falsePositive),
      recall: ratio(gate.truePositive, gate.truePositive + gate.falseNegative),
    },
    fields,
    identity: {
      allCorrect,
      accuracy: ratio(allCorrect, scoredSingles),
      committed,
      committedCorrect,
      precision: ratio(committedCorrect, committed),
    },
  };
}

function pct(value: number | null): string {
  return value === null ? '  n/a' : `${(value * 100).toFixed(1).padStart(5)}%`;
}

export function renderReport(scores: ClassifierScore[], labelCount: number): string {
  const lines: string[] = [`Labelled listings: ${labelCount}`, ''];
  for (const score of scores) {
    lines.push(`## ${score.classifier}`);
    lines.push(`Labelled basketball singles: ${score.singles} (no row from this classifier: ${score.withoutRow})`);
    lines.push(
      `Gate (is it a basketball single?): precision ${pct(score.gate.precision)}, recall ${pct(score.gate.recall)} ` +
        `[tp ${score.gate.truePositive}, fp ${score.gate.falsePositive}, fn ${score.gate.falseNegative}]`,
    );
    lines.push(
      `Identity (${IDENTITY_FIELDS.join(' + ')}): precision ${pct(score.identity.precision)} ` +
        `(${score.identity.committedCorrect}/${score.identity.committed} committed), accuracy ${pct(score.identity.accuracy)} ` +
        `(${score.identity.allCorrect}/${score.singles - score.withoutRow})`,
    );
    lines.push('', '| field | precision | recall | correct | predicted | truth |', '|---|---|---|---|---|---|');
    for (const field of SCORED_FIELDS) {
      const f = score.fields[field];
      lines.push(`| ${field} | ${pct(f.precision)} | ${pct(f.recall)} | ${f.correct} | ${f.predictedCount} | ${f.truthCount} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
