import type { TitleMetadata } from './types';

const CATEGORY_SIGNALS: { category: string; patterns: RegExp[] }[] = [
  {
    category: 'WWE',
    patterns: [/\bWWE\b/i, /\bWrestling\b/i, /\bWrestleMania\b/i],
  },
  {
    category: 'Soccer',
    patterns: [/\bUEFA\b/i, /\bFIFA\b/i, /\bPremier League\b/i, /\bMLS\b/i, /\bLa Liga\b/i, /\bChampions League\b/i],
  },
  {
    category: 'Marvel',
    patterns: [/\bMarvel\b/i, /\bSpider-Man\b/i, /\bX-Men\b/i, /\bAvengers\b/i],
  },
  {
    category: 'Pokémon',
    patterns: [/\bPok[eéÃ©]mon\b/i, /\bPikachu\b/i],
  },
  {
    category: 'NFL',
    patterns: [/\bNFL\b/i, /\bFootball\b/i],
  },
  {
    category: 'MLB',
    patterns: [/\bMLB\b/i, /\bBaseball\b/i],
  },
  {
    category: 'MMA',
    patterns: [/\bUFC\b/i, /\bMMA\b/i, /\bCombat Anthology\b/i],
  },
];

function detectCategory(title: string): string {
  for (const { category, patterns } of CATEGORY_SIGNALS) {
    if (patterns.some(pattern => pattern.test(title))) return category;
  }
  return 'NBA';
}

function extractYear(title: string): string | null {
  const match = title.match(/^(\d{4}(?:-\d{2})?)\b/);
  return match?.[1] ?? null;
}

function findCardNumberMarkerIndex(titleWithoutYear: string): number {
  const hashIndex = titleWithoutYear.indexOf('#');
  const noMatch = titleWithoutYear.match(/\bNo\.?\s*[\w-]+/i);
  if (hashIndex === -1) return noMatch?.index ?? -1;
  if (noMatch?.index === undefined) return hashIndex;
  return Math.min(hashIndex, noMatch.index);
}

type TitleSignal = {
  productLine: string | null;
  parallel: string | null;
  insert: string | null;
  variation: string | null;
  caseHit: string | null;
  shortPrint: string | null;
  variant: string | null;
};

const SEALED_PRODUCT_PATTERN = /\b(box|blaster|hobby\s+box|mega\s+box|retail\s+box|pack|break|case|poster|framed|frame|display|plaque|photo|photograph|jersey|shirt|tee|cap|hat)\b/i;

const CASE_HIT_TERMS = [
  'Kaboom',
  'Color Blast',
  'Stained Glass',
  'Manga',
  'Blank Slate',
  'Micro Mosaic',
];

const INSERT_TERMS = [
  ...CASE_HIT_TERMS,
  'Downtown',
  'Net Marvels',
  'My House',
  'Crunch Time',
  'Starcade',
];

const VARIATION_TERMS = ['Image Variation', 'Rookie Variation', 'Variation'];
const SHORT_PRINT_TERMS = ['SSP', 'SP'];
const PARALLEL_TERMS = [
  'Lime Green Prizm',
  'Green Prizm',
  'Blue Prizm',
  'Red Prizm',
  'Purple Prizm',
  'Orange Prizm',
  'Pink Prizm',
  'Gold Prizm',
  'Silver Prizm',
  'Black Prizm',
  'White Prizm',
  'Cracked Ice',
  'Fast Break',
  'Tie-Dye',
  'Blue Shimmer',
  'Gold Shimmer',
  'Green Shimmer',
  'Red Shimmer',
  'Mojo',
  'Pulsar',
  'Disco',
  'Choice',
  'Scope',
  'Zebra',
  'Tiger',
  'Elephant',
  'Genesis',
  'Refractor',
  'Sapphire',
  'Shimmer',
  'Silver',
  'Gold',
  'Blue',
  'Red',
  'Green',
  'Purple',
  'Orange',
  'Pink',
  'Black',
  'White',
  'Ice',
  'Wave',
  'Holo',
  'Chrome',
  'Prizm',
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTerm(text: string, terms: string[]): string | null {
  for (const term of terms) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegex(term)}([^A-Za-z0-9]|$)`, 'i');
    if (pattern.test(text)) return term;
  }
  return null;
}

function stripDetectedSignals(value: string, signals: Array<string | null>): string {
  let cleaned = value;
  for (const signal of signals.filter((item): item is string => Boolean(item))) {
    cleaned = cleaned.replace(new RegExp(`(^|\\s+-\\s+|\\s+)${escapeRegex(signal)}(?=\\s+-\\s+|\\s+|$)`, 'ig'), ' ');
  }
  return cleaned.replace(/\s+-\s+$/g, '').replace(/\s{2,}/g, ' ').trim();
}

function candidateBeforeNumber(title: string): { noYear: string; beforeNumber: string; numberIndex: number } {
  const noYear = title.replace(/^\d{4}(?:-\d{2})?\s+/, '');
  const numberIndex = findCardNumberMarkerIndex(noYear);
  return {
    noYear,
    beforeNumber: numberIndex === -1 ? noYear.trim() : noYear.slice(0, numberIndex).trim(),
    numberIndex,
  };
}

export function classifyTitleSignals(title: string): TitleSignal {
  const { beforeNumber, numberIndex } = candidateBeforeNumber(title);
  if (numberIndex === -1 || SEALED_PRODUCT_PATTERN.test(title)) {
    return {
      productLine: null,
      parallel: null,
      insert: null,
      variation: null,
      caseHit: null,
      shortPrint: null,
      variant: null,
    };
  }

  const dashParts = beforeNumber.split(/\s+-\s+/).map(part => part.trim()).filter(Boolean);
  const rawProductLine = dashParts[0] ?? beforeNumber;
  const signalText = dashParts.length >= 2 ? dashParts.slice(1).join(' ') : beforeNumber;
  const dashVariantFallback = dashParts.length >= 2 ? dashParts.slice(1).join(' - ').trim() : null;
  const caseHit = findTerm(signalText, CASE_HIT_TERMS);
  const insert = findTerm(signalText, INSERT_TERMS);
  const variation = findTerm(signalText, VARIATION_TERMS);
  const shortPrint = findTerm(signalText, SHORT_PRINT_TERMS);
  const rawParallel = findTerm(signalText, PARALLEL_TERMS);
  const parallel =
    rawParallel === 'Prizm' && /\bPrizm\b/i.test(rawProductLine) && !/\b(Optic|Donruss|Select|Mosaic|Chrome|Bowman|Topps)\b/i.test(rawProductLine)
      ? null
      : rawParallel;
  const variant = caseHit ?? insert ?? variation ?? shortPrint ?? dashVariantFallback ?? parallel;

  return {
    productLine: stripDetectedSignals(rawProductLine, [caseHit, insert, variation, shortPrint, parallel]) || rawProductLine || null,
    parallel,
    insert,
    variation,
    caseHit,
    shortPrint,
    variant,
  };
}

function extractSetName(title: string): string | null {
  const { noYear, beforeNumber, numberIndex } = candidateBeforeNumber(title);
  if (!noYear) return null;
  const signals = classifyTitleSignals(title);

  const dashIndex = noYear.indexOf(' - ');

  if (dashIndex !== -1 && (numberIndex === -1 || dashIndex < numberIndex)) {
    return signals.productLine ?? noYear.slice(0, dashIndex).trim() ?? null;
  }

  if (numberIndex !== -1) {
    const raw = beforeNumber;
    const cleaned = stripDetectedSignals(raw, [
      signals.caseHit,
      signals.insert,
      signals.variation,
      signals.shortPrint,
      signals.parallel,
    ]);
    return cleaned || raw || null;
  }

  return null;
}

function extractVariant(title: string): string | null {
  return classifyTitleSignals(title).variant;
}

function extractCardNumber(title: string): string | null {
  const match = title.match(/#([\w-]+)|\bNo\.?\s*([\w-]+)/i);
  return match?.[1] ?? match?.[2] ?? null;
}

function extractPlayerName(title: string): string | null {
  const match = title.match(/(?:#[\w-]+|\bNo\.?\s*[\w-]+)\s+[-–]?\s*(.*)/i);
  if (!match?.[1]) return null;

  const cleaned = match[1]
    .replace(/\/\d+\s*$/, '')
    .replace(/\b(Mint|NM|PSA|BGS|RC|SP|SSP|AUTO|PATCH)\b/gi, '')
    .replace(/,\s*$/, '')
    .trim();

  if (cleaned.length < 2 || !/^[A-Za-z]/.test(cleaned)) return null;
  return cleaned || null;
}

function extractSerial(title: string): {
  isSerial: boolean;
  serialNumber: string | null;
  serialCurrent: string | null;
  serialLimit: string | null;
} {
  const numbered = title.match(/\b(\d{1,4})\s*\/\s*(\d{1,5})\b/);
  if (numbered) {
    const serialCurrent = numbered[1] ?? null;
    const serialLimit = numbered[2] ?? null;
    return {
      isSerial: true,
      serialNumber: serialCurrent && serialLimit ? `${serialCurrent}/${serialLimit}` : serialLimit,
      serialCurrent,
      serialLimit,
    };
  }

  const limitOnly = title.match(/#?\/\s*(\d{1,5})\b/);
  if (limitOnly) {
    const serialLimit = limitOnly[1] ?? null;
    return {
      isSerial: true,
      serialNumber: serialLimit,
      serialCurrent: null,
      serialLimit,
    };
  }

  return { isSerial: false, serialNumber: null, serialCurrent: null, serialLimit: null };
}

function isAutograph(title: string): boolean {
  return /\b(signatures?|auto(?:graph)?s?|signed|auto)\b/i.test(title);
}

function isRookie(title: string): boolean {
  return /\b(rookie|rc|rook)\b/i.test(title);
}

export function parseTitleMetadata(title: string): TitleMetadata {
  const serial = extractSerial(title);

  return {
    year: extractYear(title),
    setName: extractSetName(title),
    cardNumber: extractCardNumber(title),
    playerName: extractPlayerName(title),
    variant: extractVariant(title),
    isSerial: serial.isSerial,
    serialNumber: serial.serialNumber,
    serialCurrent: serial.serialCurrent,
    serialLimit: serial.serialLimit,
    isAuto: isAutograph(title),
    isRookie: isRookie(title),
    category: detectCategory(title),
  };
}
