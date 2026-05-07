import type { ExtractionResult } from './types';

/**
 * Primary card number extractor.
 * Targets the #N convention dominant across NZ Shopify card stores.
 *
 * Handles:
 *   "#36"      → "36"       (standard numeric)
 *   "#241"     → "241"      (3-digit)
 *   "#7"       → "7"        (single digit)
 *   "#80B2-AD" → "80B2-AD"  (Topps alphanumeric)
 *
 * Rejects:
 *   "/149" — print run denominators (no # prefix)
 *   Year fragments like "2023" (no # prefix)
 */
export function extractCardNumber(title: string): string | null {
  const match = title.match(/#([A-Za-z0-9][\w-]*)/);
  return match?.[1] ?? null;
}

/**
 * Fallback extractor for "No." convention (more common on TradeMe than Shopify).
 * Handles: "No. 241", "No.241", "no 15"
 */
export function extractCardNumberFallback(title: string): string | null {
  const match = title.match(/\bNo\.?\s*(\d+)/i);
  return match?.[1] ?? null;
}

/**
 * Extracts the set context string from a listing title.
 *
 * Input:  "2023-24 Panini Prizm - Green Prizm #35 Damian Lillard"
 * Output: "Panini Prizm - Green Prizm"
 *
 * Strategy: capture everything between the year-season pattern and the # symbol.
 * This fragment is later used for a LIKE query against reference_checklists.set_name.
 */
export function extractSetContext(title: string): string | null {
  // Year patterns: "2023-24", "2024-25", "2025", "2025-26"
  const match = title.match(/\d{4}(?:-\d{2})?\s+(.+?)\s+#/);
  return match?.[1]?.trim() ?? null;
}

/**
 * Combined extraction: returns both card number and set context in one pass.
 */
export function extractAll(title: string): ExtractionResult {
  const cardNumber = extractCardNumber(title) ?? extractCardNumberFallback(title);
  const setContext = extractSetContext(title);
  return { cardNumber, setContext };
}

/**
 * Direct player name match: checks if any watchlist player name
 * appears literally in the listing title. Case-insensitive.
 *
 * Returns the matched player name (original casing from watchlist) or null.
 */
export function extractDirectPlayerMatch(
  title: string,
  watchlistNames: string[]
): string | null {
  const titleLower = title.toLowerCase();
  return watchlistNames.find(name => titleLower.includes(name.toLowerCase())) ?? null;
}
