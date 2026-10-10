// Pure display helpers for customer match cards.
// No UI framework or server-only imports; relative imports only, so engine tests can import this file.
// Store-controlled values (titles, URLs, images) are untrusted: everything here
// either sanitises them or avoids reading them at all.

import type { ListingRow } from "./types";

export type MatchTier = "strong" | "confirmed" | "possible" | "unmatched";

export function matchTier(status: string | null, confidence: number | null): MatchTier {
  if (status === "possible") return "possible";
  if (status === null && (confidence === null || confidence <= 0)) return "unmatched";
  if (confidence !== null && confidence >= 0.9) return "strong";
  return "confirmed";
}

export function tierLabel(tier: MatchTier): string {
  switch (tier) {
    case "strong":
      return "Strong match";
    case "confirmed":
      return "Confirmed match";
    case "possible":
      return "Possible match";
    case "unmatched":
      return "Not matched yet";
  }
}

export function confidencePercent(confidence: number | null): string | null {
  // The watchlist select coalesces missing confidence to 0, so 0 means "unknown".
  if (confidence === null || !Number.isFinite(confidence) || confidence <= 0) return null;
  return `${Math.round(confidence * 100)}%`;
}

// Identity reasons (what card this is) are listed before attribute reasons.
const IDENTITY_REASONS: ReadonlyMap<string, string> = new Map([
  ["Watchlist player name found in title", "Player name in listing"],
  ["Watchlist target card number matched", "Card number matches your watchlist"],
  ["Checklist matched by set context and card number", "Set and card number match the checklist"],
  ["Card number resolved to one unique checklist player", "Card number matches one player on the checklist"],
  ["Card number extracted", "Card number found"],
]);

const ATTRIBUTE_REASONS: ReadonlyMap<string, string | null> = new Map([
  ["No card number extracted", null],
  ["Serialized card detected", "Numbered card"],
  ["Rookie indicator detected", "Rookie card"],
  ["Autograph indicator detected", "Autograph"],
]);

const BANNED_REASON_WORDS = /backfill|canonical|\bmvp\b|cached/i;
const MAX_REASON_LENGTH = 60;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function mapReason(raw: string): { text: string; identity: boolean } | null {
  const reason = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!reason) return null;

  const identity = IDENTITY_REASONS.get(reason);
  if (identity) return { text: identity, identity: true };

  if (ATTRIBUTE_REASONS.has(reason)) {
    const mapped = ATTRIBUTE_REASONS.get(reason) ?? null;
    return mapped ? { text: mapped, identity: false } : null;
  }

  const serial = /^Serial number (.+)$/.exec(reason);
  if (serial?.[1]) return { text: truncate(`Numbered ${serial[1]}`, MAX_REASON_LENGTH), identity: false };

  const detected = /^(Case hit|Insert|Variation|Short print|Parallel) detected: (.+)$/.exec(reason);
  if (detected?.[1] && detected[2]) {
    return { text: truncate(`${detected[1]}: ${detected[2]}`, MAX_REASON_LENGTH), identity: false };
  }

  const generic = reason
    .replace(/serialized/gi, (match) => (match.startsWith("S") ? "Numbered" : "numbered"))
    .replace(/ detected$/, "")
    .trim();
  if (!generic || BANNED_REASON_WORDS.test(generic)) return null;
  return { text: truncate(generic, MAX_REASON_LENGTH), identity: false };
}

/** Plain-English, de-duplicated match reasons, identity reasons first, at most `max`. */
export function customerReasons(reasons: string[] | null | undefined, max = 2): string[] {
  if (!Array.isArray(reasons) || max <= 0) return [];
  const identity: string[] = [];
  const attributes: string[] = [];
  const seen = new Set<string>();
  for (const raw of reasons) {
    if (typeof raw !== "string") continue;
    const mapped = mapReason(raw);
    if (!mapped || seen.has(mapped.text)) continue;
    seen.add(mapped.text);
    (mapped.identity ? identity : attributes).push(mapped.text);
  }
  return [...identity, ...attributes].slice(0, max);
}

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Alt text built from parsed card fields. Never reads the store-controlled title. */
export function cardAltText(
  listing: Pick<ListingRow, "player_name" | "year" | "set_name" | "card_number" | "variant" | "store_name">,
): string {
  const parts = [
    listing.player_name,
    listing.year,
    listing.set_name,
    listing.card_number ? `#${listing.card_number}` : null,
    listing.variant,
  ]
    .map((part) => (typeof part === "string" ? cleanText(part) : ""))
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    const store = cleanText(listing.store_name ?? "");
    return store ? truncate(`Card photo from ${store}`, 110) : "Card photo";
  }
  return `${truncate(cleanText(parts.join(" ")), 110)} card photo`;
}

function parseHttpUrl(raw: string | null | undefined): URL | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;
  if (value.startsWith("//")) value = `https:${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return url;
}

function isShopifyImage(url: URL): boolean {
  return url.hostname === "cdn.shopify.com" || url.pathname.startsWith("/cdn/shop/");
}

/** Sanitised https image URL (Shopify images resized via `width`), or null if unsafe. */
export function cardImageSrc(raw: string | null | undefined, width?: number): string | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  url.protocol = "https:";
  if (width !== undefined && Number.isFinite(width) && width > 0 && isShopifyImage(url)) {
    url.searchParams.set("width", String(Math.round(width)));
  }
  return url.toString();
}

/** Responsive srcset for Shopify-hosted images; undefined for other hosts. */
export function cardImageSrcSet(raw: string | null | undefined): string | undefined {
  const url = parseHttpUrl(raw);
  if (!url || !isShopifyImage(url)) return undefined;
  const parts = [320, 480, 720].map((width) => {
    const src = cardImageSrc(raw, width);
    return src ? `${src} ${width}w` : null;
  });
  if (parts.some((part) => part === null)) return undefined;
  return parts.join(", ");
}

/** Store listing link limited to http(s); anything else becomes "#". */
export function safeListingHref(raw: string | null | undefined): string {
  const url = parseHttpUrl(raw);
  return url ? url.toString() : "#";
}

function isKnownCurrency(code: string): boolean {
  const supported = (Intl as { supportedValuesOf?: (key: "currency") => string[] }).supportedValuesOf;
  if (typeof supported !== "function") return true;
  try {
    return supported("currency").includes(code);
  } catch {
    return true;
  }
}

export function formatPrice(value: number | string | null, currency: string | null): string {
  const price = typeof value === "number" ? value : value === null || value === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(price)) return "Price unavailable";
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (/^[A-Z]{3}$/.test(code) && isKnownCurrency(code)) {
    try {
      return new Intl.NumberFormat("en-NZ", { style: "currency", currency: code, currencyDisplay: "symbol" }).format(price);
    } catch {
      // Unknown currency code: fall through to the plain format.
    }
  }
  return `$${price.toFixed(2)}`;
}

export function formatCheckedAgo(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const checked = new Date(iso).getTime();
  if (!Number.isFinite(checked)) return null;
  const diffMs = now.getTime() - checked;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Checked just now";
  if (minutes < 60) return `Checked ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Checked ${hours} h ago`;
  return `Checked ${Math.floor(hours / 24)} d ago`;
}
