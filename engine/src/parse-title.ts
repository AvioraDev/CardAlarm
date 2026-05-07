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

function extractSetName(title: string): string | null {
  const noYear = title.replace(/^\d{4}(?:-\d{2})?\s+/, '');
  if (!noYear) return null;

  const dashIndex = noYear.indexOf(' - ');
  const numberIndex = findCardNumberMarkerIndex(noYear);

  if (dashIndex !== -1 && (numberIndex === -1 || dashIndex < numberIndex)) {
    return noYear.slice(0, dashIndex).trim() || null;
  }

  if (numberIndex !== -1) {
    const raw = noYear.slice(0, numberIndex).trim();
    const cleaned = raw
      .replace(/\s+(Prizm|Holo|Chrome|Refractor|Shimmer|Sapphire|Hyper|Mosaic|Wave)\s*$/i, '')
      .trim();
    return cleaned || raw || null;
  }

  return null;
}

function extractVariant(title: string): string | null {
  const noYear = title.replace(/^\d{4}(?:-\d{2})?\s+/, '');
  const numberIndex = findCardNumberMarkerIndex(noYear);
  if (numberIndex === -1) return null;

  const beforeNumber = noYear.slice(0, numberIndex).trim();
  const dashParts = beforeNumber.split(/\s+-\s+/);

  if (dashParts.length >= 2) {
    return dashParts.slice(1).join(' - ').trim() || null;
  }

  const inlineMatch = beforeNumber.match(
    /\b((?:(?:Red|Blue|Green|Purple|Pink|Orange|Yellow|Gold|Silver|Black|White|Lime|Ice|Neon|Ruby|Sapphire|Hyper|Cosmic|Galactic)\s+)?(?:Prizm|Wave|Holo|Chrome|Refractor|Shimmer|Mosaic|Ice|Sapphire))\s*$/i
  );
  return inlineMatch?.[1]?.trim() ?? null;
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
