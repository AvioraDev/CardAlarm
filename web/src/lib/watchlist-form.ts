export type WatchlistFormInput = {
  name: string;
  brand: string | null;
  productLine: string | null;
  season: string | null;
  cardNumber: string | null;
  parallel: string | null;
  rookieOnly: boolean;
  autographOnly: boolean;
  relicOnly: boolean;
  serialNumberedOnly: boolean;
  gradedOnly: boolean;
  rawOnly: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string;
  includeTerms: string | null;
  excludeTerms: string | null;
  minimumMatchConfidence: number;
  notificationEnabled: boolean;
};

export type WatchlistFormResult =
  | { ok: true; value: WatchlistFormInput }
  | { ok: false; error: string };

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, key: string, label: string, maxLength: number): WatchlistFormResult | string | null {
  const value = field(formData, key);
  if (!value) return null;
  if (value.length > maxLength) return { ok: false, error: `${label} is too long.` };
  return value;
}

function checkbox(formData: FormData, key: string, label: string): WatchlistFormResult | boolean {
  const value = formData.get(key);
  if (value === null) return false;
  if (value === "on") return true;
  return { ok: false, error: `${label} is invalid.` };
}

function optionalMoney(formData: FormData, key: string, label: string): WatchlistFormResult | number | null {
  const value = field(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) {
    return { ok: false, error: `${label} must be a valid positive price.` };
  }
  return Math.round(parsed * 100) / 100;
}

function confidence(formData: FormData): WatchlistFormResult | number {
  const value = field(formData, "minimum_match_confidence");
  if (!value) return 0.75;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return { ok: false, error: "Minimum confidence must be between 0 and 1." };
  }
  return parsed;
}

export function parsePositiveFormId(formData: FormData, key: string): number | null {
  const value = formData.get(key);
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value.trim())) return null;
  return Number.parseInt(value, 10);
}

export function parseBooleanState(formData: FormData, key: string): boolean | null {
  const value = formData.get(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function isGenericRookieWatchlistTerm(value: string | null): boolean {
  return /^(rookie|rookies|rc)$/i.test((value ?? "").trim());
}

export function parseWatchlistForm(formData: FormData): WatchlistFormResult {
  const name = field(formData, "name");
  if (!name) return { ok: false, error: "Watchlist name is required." };
  if (name.length > 120) return { ok: false, error: "Watchlist name is too long." };

  const brand = optionalText(formData, "brand", "Brand", 80);
  if (typeof brand !== "string" && brand !== null) return brand;
  const productLine = optionalText(formData, "product_line", "Product line", 120);
  if (typeof productLine !== "string" && productLine !== null) return productLine;
  const season = optionalText(formData, "season", "Season", 20);
  if (typeof season !== "string" && season !== null) return season;
  const cardNumber = optionalText(formData, "card_number", "Card number", 40);
  if (typeof cardNumber !== "string" && cardNumber !== null) return cardNumber;
  const parallel = optionalText(formData, "parallel", "Parallel", 80);
  if (typeof parallel !== "string" && parallel !== null) return parallel;
  const includeTerms = optionalText(formData, "include_terms", "Include terms", 500);
  if (typeof includeTerms !== "string" && includeTerms !== null) return includeTerms;
  const excludeTerms = optionalText(formData, "exclude_terms", "Exclude terms", 500);
  if (typeof excludeTerms !== "string" && excludeTerms !== null) return excludeTerms;

  const minPrice = optionalMoney(formData, "min_price", "Minimum price");
  if (typeof minPrice !== "number" && minPrice !== null) return minPrice;
  const maxPrice = optionalMoney(formData, "max_price", "Maximum price");
  if (typeof maxPrice !== "number" && maxPrice !== null) return maxPrice;
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    return { ok: false, error: "Minimum price cannot be higher than maximum price." };
  }

  const minimumMatchConfidence = confidence(formData);
  if (typeof minimumMatchConfidence !== "number") return minimumMatchConfidence;

  const currency = (field(formData, "currency") || "NZD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "Currency must be a 3-letter code." };

  const rookieOnly = checkbox(formData, "rookie_only", "Rookie only");
  if (typeof rookieOnly !== "boolean") return rookieOnly;
  const autographOnly = checkbox(formData, "autograph_only", "Autographs");
  if (typeof autographOnly !== "boolean") return autographOnly;
  const relicOnly = checkbox(formData, "relic_only", "Relics");
  if (typeof relicOnly !== "boolean") return relicOnly;
  const serialNumberedOnly = checkbox(formData, "serial_numbered_only", "Serial numbered");
  if (typeof serialNumberedOnly !== "boolean") return serialNumberedOnly;
  const gradedOnly = checkbox(formData, "graded_only", "Graded");
  if (typeof gradedOnly !== "boolean") return gradedOnly;
  const rawOnly = checkbox(formData, "raw_only", "Raw");
  if (typeof rawOnly !== "boolean") return rawOnly;
  const notificationEnabled = checkbox(formData, "notification_enabled", "Email alerts");
  if (typeof notificationEnabled !== "boolean") return notificationEnabled;
  const genericRookieWatchlist =
    isGenericRookieWatchlistTerm(name) &&
    (includeTerms === null || isGenericRookieWatchlistTerm(includeTerms));

  return {
    ok: true,
    value: {
      name,
      brand,
      productLine,
      season,
      cardNumber,
      parallel,
      rookieOnly: rookieOnly || genericRookieWatchlist,
      autographOnly,
      relicOnly,
      serialNumberedOnly,
      gradedOnly,
      rawOnly,
      minPrice,
      maxPrice,
      currency,
      includeTerms: genericRookieWatchlist ? null : includeTerms,
      excludeTerms,
      minimumMatchConfidence,
      notificationEnabled,
    },
  };
}
