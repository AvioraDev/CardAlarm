/**
 * Open-ended fields that a pattern reads more reliably than a model: season, card number, print run and
 * grade. Jev is weak at numbers by its own documentation, so these stay in code.
 */

export interface TitleFields {
  /** As written, normalised to "2023-24" or "2024". */
  season: string | null;
  /** Catalogue seasons this could mean. A bare "2024" may be the 2023-24 or the 2024-25 season. */
  seasonCandidates: string[];
  cardNumber: string | null;
  serialCurrent: number | null;
  serialLimit: number | null;
  grader: string | null;
  grade: string | null;
  isRookie: boolean;
  isAutograph: boolean;
  isRelic: boolean;
}

const SEASON_PATTERN = /(?<![\d#/])((?:19|20)\d{2})(?:\s*[-/]\s*(\d{4}|\d{2}))?(?![\d/])/;
const GRADE_PATTERN = /\b(PSA|BGS|SGC|CGC|CSG|HGA|TAG|BECKETT)\b[^0-9]{0,14}?(10|[1-9](?:\.5)?)(?![\d/])/i;

function twoDigits(year: number): string {
  return String(year % 100).padStart(2, '0');
}

export function parseSeason(text: string): { season: string | null; seasonCandidates: string[] } {
  const match = text.match(SEASON_PATTERN);
  if (!match) return { season: null, seasonCandidates: [] };

  const startYear = Number(match[1]);
  if (match[2]) {
    const endSuffix = match[2].slice(-2);
    // "2023-24" is a season only when the second part is the following year.
    if (endSuffix === twoDigits(startYear + 1)) {
      const season = `${startYear}-${endSuffix}`;
      return { season, seasonCandidates: [season] };
    }
  }

  return {
    season: String(startYear),
    seasonCandidates: [`${startYear}-${twoDigits(startYear + 1)}`, `${startYear - 1}-${twoDigits(startYear)}`, String(startYear)],
  };
}

export function parseSerial(text: string): { serialCurrent: number | null; serialLimit: number | null } {
  for (const match of text.matchAll(/(?<![\d.])#?\s*(\d{1,4})\s*\/\s*(\d{1,5})(?![\d.])/g)) {
    const current = match[1]!;
    const limit = match[2]!;
    // "2023/24" and "2023/2024" are seasons, not print runs.
    const looksLikeSeason = /^(19|20)\d{2}$/.test(current) && (limit.length === 2 || limit.length === 4);
    if (looksLikeSeason) continue;
    if (Number(limit) === 0 || Number(current) > Number(limit)) continue;
    return { serialCurrent: Number(current), serialLimit: Number(limit) };
  }

  const limitOnly = text.match(/(?<![\d.])#?\s*\/\s*(\d{1,5})(?![\d.])/);
  if (limitOnly && Number(limitOnly[1]) > 0) return { serialCurrent: null, serialLimit: Number(limitOnly[1]) };

  if (/\b(1\s*of\s*1|one\s*of\s*one)\b/i.test(text)) return { serialCurrent: 1, serialLimit: 1 };
  return { serialCurrent: null, serialLimit: null };
}

export function parseCardNumber(text: string): string | null {
  // "#35", "#RS-DOT", "#80B2-AD". A "#" that opens a print run ("#/49", "#39/99") is not a card number.
  for (const match of text.matchAll(/#\s*([A-Za-z0-9][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)(?![A-Za-z0-9-])(?!\s*\/\s*\d)/g)) {
    return match[1]!;
  }
  // "No. 298", "No.61". Anchored so the "No" inside a name such as Nowitzki cannot match.
  const numbered = text.match(/(?:^|[\s(\-–])No\.?\s*(\d[A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)(?![\d/])/i);
  return numbered?.[1] ?? null;
}

export function parseGrade(text: string): { grader: string | null; grade: string | null } {
  const match = text.match(GRADE_PATTERN);
  if (!match) return { grader: null, grade: null };
  const grader = match[1]!.toUpperCase();
  return { grader: grader === 'BECKETT' ? 'BGS' : grader, grade: match[2]! };
}

export function parseTitleFields(title: string): TitleFields {
  const serial = parseSerial(title);
  return {
    ...parseSeason(title),
    cardNumber: parseCardNumber(title),
    ...serial,
    ...parseGrade(title),
    isRookie: /\b(rc|rookies?)\b/i.test(title),
    isAutograph: /\b(auto(?:graph(?:ed|s)?)?s?|signatures?|signed|ink)\b/i.test(title),
    isRelic: /\b(patch(?:es)?|relics?|memorabilia|materials?|swatch(?:es)?|jersey)\b/i.test(title),
  };
}
