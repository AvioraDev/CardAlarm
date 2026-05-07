import type Database from 'better-sqlite3';
import type { RawListing, MatchResult, ListingInsert, WatchlistRow } from './types';
import { extractAll, extractDirectPlayerMatch } from './extract';
import { parseTitleMetadata } from './parse-title';
import {
  getActiveWatchlistPlayers,
  getChecklistBySetAndNumber,
  getChecklistByNumber,
  upsertListing,
  getAllChecklistPlayerNames,
} from './sqlite-test-db';

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

function confidenceStatus(confidence: number): 'confirmed' | 'possible' {
  return confidence >= 0.75 ? 'confirmed' : 'possible';
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

function completeMatch(
  db: Database.Database,
  listing: RawListing,
  matchType: 'Direct' | 'Stealth',
  playerName: string,
  confidence: number,
  reasons: string[],
  unmatchedFields: string[] = []
): MatchResult {
  const insert = buildInsert(listing, matchType, playerName, confidence, reasons, unmatchedFields);
  upsertListing(db, insert);

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

export function processListingWithCache(
  db: Database.Database,
  listing: RawListing,
  watchlistEntries: WatchlistRow[],
  watchlistNameSet: Set<string>,
  allPlayerNames: string[]
): MatchResult {
  const watchlistNames = watchlistEntries.map(w => w.player_name);
  const { cardNumber, setContext } = extractAll(listing.title);
  const meta = parseTitleMetadata(listing.title);
  const baseReasons = [
    meta.isSerial ? 'Serialized card detected' : null,
    meta.serialCurrent && meta.serialLimit ? `Serial number ${meta.serialCurrent}/${meta.serialLimit}` : null,
    meta.isRookie ? 'Rookie indicator detected' : null,
    meta.isAuto ? 'Autograph indicator detected' : null,
    meta.variant ? `Parallel/variant detected: ${meta.variant}` : null,
  ].filter((reason): reason is string => Boolean(reason));

  if (!hasSportsCardContext(listing.title, cardNumber)) {
    return noMatch();
  }

  const directMatch = extractDirectPlayerMatch(listing.title, watchlistNames);
  if (directMatch) {
    const confidence = meta.cardNumber ? 0.94 : 0.88;
    return completeMatch(db, listing, 'Direct', directMatch, confidence, [
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
    return completeMatch(db, listing, 'Stealth', targetNumberMatch.player_name, 0.8, [
      'Watchlist target card number matched',
      `Card number ${cardNumber} extracted`,
      ...baseReasons,
    ]);
  }

  if (setContext) {
    const checklistHit = getChecklistBySetAndNumber(db, setContext, cardNumber);
    if (checklistHit && watchlistNameSet.has(checklistHit.player_name.toLowerCase())) {
      return completeMatch(db, listing, 'Stealth', checklistHit.player_name, 0.86, [
        'Checklist matched by set context and card number',
        `Card number ${cardNumber} resolved to ${checklistHit.player_name}`,
        ...baseReasons,
      ]);
    }
  }

  const broadHits = getChecklistByNumber(db, cardNumber);
  const broadPlayerName = uniqueChecklistPlayerName(broadHits);
  if (broadPlayerName && watchlistNameSet.has(broadPlayerName.toLowerCase())) {
    return completeMatch(db, listing, 'Stealth', broadPlayerName, 0.76, [
      'Card number resolved to one unique checklist player',
      `Card number ${cardNumber} resolved to ${broadPlayerName}`,
      ...baseReasons,
    ], setContext ? [] : ['set_context']);
  }

  return noMatch();
}

export function processListing(db: Database.Database, listing: RawListing): MatchResult {
  const watchlistEntries = getActiveWatchlistPlayers(db);
  const watchlistNameSet = new Set(watchlistEntries.map(w => w.player_name.toLowerCase()));
  const allPlayerNames = getAllChecklistPlayerNames(db);
  return processListingWithCache(db, listing, watchlistEntries, watchlistNameSet, allPlayerNames);
}

export function checkMatch(db: Database.Database, title: string): MatchResult {
  const listing: RawListing = {
    externalId: '__dry_run__',
    source: '__dry_run__',
    title,
    price: 0,
    url: '',
    imageUrl: '',
  };
  const watchlistEntries = getActiveWatchlistPlayers(db);
  const watchlistNameSet = new Set(watchlistEntries.map(w => w.player_name.toLowerCase()));
  const allPlayerNames = getAllChecklistPlayerNames(db);

  const result = processListingWithCache(db, listing, watchlistEntries, watchlistNameSet, allPlayerNames);
  if (result.matched) {
    db.prepare('DELETE FROM listings_feed WHERE external_id = ? AND source = ?').run('__dry_run__', '__dry_run__');
    db.prepare('DELETE FROM product_card_matches WHERE external_id = ? AND source = ?').run('__dry_run__', '__dry_run__');
  }
  return result;
}

export { MATCHER_VERSION, titleContainsPlayerName, uniqueChecklistPlayerName };
