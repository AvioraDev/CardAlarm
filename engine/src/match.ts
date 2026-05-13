import type { DbClient } from './db';
import type { RawListing, MatchResult, ListingInsert, WatchlistRow, ChecklistRow } from './types';
import { extractAll, extractDirectPlayerMatch } from './extract';
import { classifyTitleSignals, parseTitleMetadata } from './parse-title';
import {
  getActiveWatchlistPlayers,
  getChecklistBySetAndNumber,
  getChecklistByNumber,
  upsertListing,
  getAllChecklistPlayerNames,
} from './db';

const MATCHER_VERSION = 'matcher-v3-confidence-serial';

function noMatch(): MatchResult {
  return {
    matched: false,
    matchType: null,
    playerName: null,
    confidence: 0,
    status: null,
    reasons: [],
    unmatchedFields: [],
  };
}

function titleContainsPlayerName(title: string): boolean {
  const afterNumber = title.match(/(?:#[\w-]+|\bNo\.?\s*[\w-]+)\s+[-–]?\s*(.*)/i);
  if (!afterNumber?.[1]) return false;

  const cleaned = afterNumber[1]
    .trim()
    .replace(/\/\d+\s*$/, '')
    .replace(/\b(Mint|NM|PSA|BGS|RC|SP|SSP|AUTO|PATCH)\b/gi, '')
    .trim();

  if (!cleaned) return false;
  return /^[A-Z][a-zA-Z'.]+(?:\s+[A-Z][a-zA-Z'.,-]+)+/.test(cleaned);
}

function hasSportsCardContext(title: string, cardNumber: string | null): boolean {
  const hasPositiveSignal =
    cardNumber !== null ||
    /(?:19|20)\d{2}|\b\d{2}-\d{2}\b/.test(title) ||
    /\b(panini|topps|prizm|bowman|select|optic|donruss|fleer|upper\sdeck|leaf|score|chronicles|mosaic|revolution)\b/i.test(title);

  const hasNonCardProductSignal =
    /\b(poster|framed|frame|display|plaque|photo|photograph|jersey|shirt|tee|cap|hat|box|pack|break|case)\b/i.test(title);

  return hasPositiveSignal && !hasNonCardProductSignal;
}

function titleContainsKnownPlayer(title: string, playerNames: string[]): boolean {
  const normalizedTitle = title.toLowerCase();
  return playerNames.some(name => normalizedTitle.includes(name.toLowerCase()));
}

function uniqueChecklistPlayerName(hits: { player_name: string }[]): string | null {
  const names = new Set(hits.map(hit => hit.player_name.toLowerCase()));
  if (names.size !== 1) return null;
  return hits[0]?.player_name ?? null;
}

function normalizeChecklistText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export class ChecklistLookupCache {
  private readonly byNumber = new Map<string, ChecklistRow[]>();
  private readonly loadedNumbers = new Set<string>();

  constructor(rows: ChecklistRow[] = []) {
    this.addRows(rows);
  }

  addRows(rows: ChecklistRow[]): void {
    for (const row of rows) {
      const cardNumber = row.card_number?.trim();
      if (!cardNumber) continue;
      this.loadedNumbers.add(cardNumber);
      const existing = this.byNumber.get(cardNumber) ?? [];
      existing.push(row);
      this.byNumber.set(cardNumber, existing);
    }
  }

  markLoaded(cardNumbers: string[]): void {
    for (const cardNumber of cardNumbers.map(value => value.trim()).filter(Boolean)) {
      this.loadedNumbers.add(cardNumber);
    }
  }

  hasCardNumber(cardNumber: string): boolean {
    return this.loadedNumbers.has(cardNumber);
  }

  missingCardNumbers(cardNumbers: string[]): string[] {
    return [...new Set(cardNumbers.map(value => value.trim()).filter(Boolean))]
      .filter(cardNumber => !this.hasCardNumber(cardNumber));
  }

  getByNumber(cardNumber: string): ChecklistRow[] {
    return this.byNumber.get(cardNumber) ?? [];
  }

  getBySetAndNumber(setNameFragment: string, cardNumber: string): ChecklistRow | undefined {
    const normalizedFragment = normalizeChecklistText(setNameFragment);
    if (!normalizedFragment) return undefined;

    return this.getByNumber(cardNumber).find(row => {
      const normalizedSetName = normalizeChecklistText(row.set_name ?? '');
      return normalizedSetName.includes(normalizedFragment) || normalizedFragment.includes(normalizedSetName);
    });
  }
}

export function createChecklistLookup(rows: ChecklistRow[] = []): ChecklistLookupCache {
  return new ChecklistLookupCache(rows);
}

function confidenceStatus(confidence: number): 'confirmed' | 'possible' {
  return confidence >= 0.75 ? 'confirmed' : 'possible';
}

function titleSignalReasons(title: string): string[] {
  const signals = classifyTitleSignals(title);
  return [
    signals.caseHit ? `Case hit detected: ${signals.caseHit}` : null,
    !signals.caseHit && signals.insert ? `Insert detected: ${signals.insert}` : null,
    signals.variation ? `Variation detected: ${signals.variation}` : null,
    signals.shortPrint ? `Short print detected: ${signals.shortPrint}` : null,
    signals.parallel ? `Parallel detected: ${signals.parallel}` : null,
  ].filter((reason): reason is string => Boolean(reason));
}

function buildInsert(
  listing: RawListing,
  matchType: 'Direct' | 'Stealth',
  matchedPlayerName: string,
  confidence: number,
  reasons: string[],
  unmatchedFields: string[]
): ListingInsert {
  const meta = parseTitleMetadata(listing.title);
  return {
    ...listing,
    matchType,
    year: meta.year,
    setName: meta.setName,
    cardNumber: meta.cardNumber,
    playerName: matchedPlayerName || meta.playerName,
    variant: meta.variant,
    isSerial: meta.isSerial,
    serialNumber: meta.serialNumber,
    serialCurrent: meta.serialCurrent,
    serialLimit: meta.serialLimit,
    isAuto: meta.isAuto,
    isRookie: meta.isRookie,
    category: meta.category,
    matchConfidence: confidence,
    matchStatus: confidenceStatus(confidence),
    matchReasons: reasons,
    unmatchedFields,
    matcherVersion: MATCHER_VERSION,
  };
}

async function completeMatch(
  db: DbClient,
  listing: RawListing,
  matchType: 'Direct' | 'Stealth',
  playerName: string,
  confidence: number,
  reasons: string[],
  unmatchedFields: string[] = []
): Promise<MatchResult> {
  const insert = buildInsert(listing, matchType, playerName, confidence, reasons, unmatchedFields);
  await upsertListing(db, insert);

  return {
    matched: true,
    matchType,
    playerName,
    confidence,
    status: confidenceStatus(confidence),
    reasons,
    unmatchedFields,
  };
}

export async function processListingWithCache(
  db: DbClient,
  listing: RawListing,
  watchlistEntries: WatchlistRow[],
  watchlistNameSet: Set<string>,
  allPlayerNames: string[],
  checklistLookup?: ChecklistLookupCache
): Promise<MatchResult> {
  const watchlistNames = watchlistEntries.map(w => w.player_name);
  const { cardNumber, setContext } = extractAll(listing.title);
  const meta = parseTitleMetadata(listing.title);
  const baseReasons = [
    meta.isSerial ? 'Serialized card detected' : null,
    meta.serialCurrent && meta.serialLimit ? `Serial number ${meta.serialCurrent}/${meta.serialLimit}` : null,
    meta.isRookie ? 'Rookie indicator detected' : null,
    meta.isAuto ? 'Autograph indicator detected' : null,
    ...titleSignalReasons(listing.title),
  ].filter((reason): reason is string => Boolean(reason));

  if (!hasSportsCardContext(listing.title, cardNumber)) {
    return noMatch();
  }

  const directMatch = extractDirectPlayerMatch(listing.title, watchlistNames);
  if (directMatch) {
    const confidence = meta.cardNumber ? 0.94 : 0.88;
    return await completeMatch(db, listing, 'Direct', directMatch, confidence, [
      'Watchlist player name found in title',
      meta.cardNumber ? 'Card number extracted' : 'No card number extracted',
      ...baseReasons,
    ]);
  }

  if (!cardNumber) {
    return noMatch();
  }

  if (titleContainsKnownPlayer(listing.title, allPlayerNames) || titleContainsPlayerName(listing.title)) {
    return noMatch();
  }

  const targetNumberMatch = watchlistEntries.find(w => {
    if (!w.target_numbers) return false;
    const targetNumbers = w.target_numbers.split(',').map(n => n.trim());
    return targetNumbers.includes(cardNumber);
  });

  if (targetNumberMatch) {
    return await completeMatch(db, listing, 'Stealth', targetNumberMatch.player_name, 0.8, [
      'Watchlist target card number matched',
      `Card number ${cardNumber} extracted`,
      ...baseReasons,
    ]);
  }

  if (setContext) {
    const checklistHit = checklistLookup
      ? checklistLookup.getBySetAndNumber(setContext, cardNumber)
      : await getChecklistBySetAndNumber(db, setContext, cardNumber);
    if (checklistHit && watchlistNameSet.has(checklistHit.player_name.toLowerCase())) {
      return await completeMatch(db, listing, 'Stealth', checklistHit.player_name, 0.86, [
        'Checklist matched by set context and card number',
        `Card number ${cardNumber} resolved to ${checklistHit.player_name}`,
        ...baseReasons,
      ]);
    }
  }

  const broadHits = checklistLookup
    ? checklistLookup.getByNumber(cardNumber)
    : await getChecklistByNumber(db, cardNumber);
  const broadPlayerName = uniqueChecklistPlayerName(broadHits);
  if (broadPlayerName && watchlistNameSet.has(broadPlayerName.toLowerCase())) {
    return await completeMatch(db, listing, 'Stealth', broadPlayerName, 0.76, [
      'Card number resolved to one unique checklist player',
      `Card number ${cardNumber} resolved to ${broadPlayerName}`,
      ...baseReasons,
    ], setContext ? [] : ['set_context']);
  }

  return noMatch();
}

export async function processListing(db: DbClient, listing: RawListing): Promise<MatchResult> {
  const watchlistEntries = await getActiveWatchlistPlayers(db);
  const watchlistNameSet = new Set(watchlistEntries.map(w => w.player_name.toLowerCase()));
  const allPlayerNames = await getAllChecklistPlayerNames(db);
  return processListingWithCache(db, listing, watchlistEntries, watchlistNameSet, allPlayerNames);
}

export async function checkMatch(db: DbClient, title: string): Promise<MatchResult> {
  const listing: RawListing = {
    externalId: '__dry_run__',
    source: '__dry_run__',
    title,
    price: 0,
    url: '',
    imageUrl: '',
  };
  const watchlistEntries = await getActiveWatchlistPlayers(db);
  const watchlistNameSet = new Set(watchlistEntries.map(w => w.player_name.toLowerCase()));
  const allPlayerNames = await getAllChecklistPlayerNames(db);

  const result = await processListingWithCache(db, listing, watchlistEntries, watchlistNameSet, allPlayerNames);
  if (result.matched) {
    await db.query('delete from listings_feed where external_id = $1 and source = $2', ['__dry_run__', '__dry_run__']);
    await db.query('delete from product_card_matches where external_id = $1 and source = $2', ['__dry_run__', '__dry_run__']);
  }
  return result;
}

export { MATCHER_VERSION, titleContainsPlayerName, uniqueChecklistPlayerName };
