export type StoreFormInput = {
  slug: string;
  name: string;
  baseUrl: string;
  sourceType: string;
  countryCode: string;
  currency: string;
  scanFrequencyMinutes: number;
  scanStrategy: "incremental" | "full";
  earlyStopEnabled: boolean;
  earlyStopUnchangedPages: number;
  isActive: boolean;
};

export type StoreFormResult =
  | { ok: true; value: StoreFormInput }
  | { ok: false; error: string };

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseStoreForm(formData: FormData): StoreFormResult {
  const name = field(formData, "name");
  const slug = normalizeSlug(field(formData, "slug") || name);
  const sourceType = field(formData, "source_type") || "shopify";
  const countryCode = (field(formData, "country_code") || "NZ").toUpperCase();
  const currency = (field(formData, "currency") || "NZD").toUpperCase();
  const scanFrequency = Number.parseInt(field(formData, "scan_frequency_minutes") || "1440", 10);
  const scanStrategy = field(formData, "scan_strategy") || "incremental";
  const earlyStopPages = Number.parseInt(field(formData, "early_stop_unchanged_pages") || "2", 10);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(field(formData, "base_url"));
  } catch {
    return { ok: false, error: "A valid store URL is required." };
  }

  if (!name) return { ok: false, error: "Store name is required." };
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, error: "Store slug must use letters, numbers, and hyphens." };
  }
  if (sourceType !== "shopify") return { ok: false, error: "Only Shopify stores are supported for MVP scanning." };
  if (scanStrategy !== "incremental" && scanStrategy !== "full") {
    return { ok: false, error: "Scan strategy must be incremental or full." };
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) return { ok: false, error: "Store URL must use http or https." };
  if (!Number.isInteger(scanFrequency) || scanFrequency < 15 || scanFrequency > 10080) {
    return { ok: false, error: "Scan frequency must be between 15 minutes and 7 days." };
  }
  if (!Number.isInteger(earlyStopPages) || earlyStopPages < 1 || earlyStopPages > 50) {
    return { ok: false, error: "Early-stop unchanged pages must be between 1 and 50." };
  }

  parsedUrl.hash = "";
  parsedUrl.search = "";

  return {
    ok: true,
    value: {
      slug,
      name,
      baseUrl: parsedUrl.toString().replace(/\/+$/, ""),
      sourceType,
      countryCode,
      currency,
      scanFrequencyMinutes: scanFrequency,
      scanStrategy,
      earlyStopEnabled: formData.get("early_stop_enabled") === "on",
      earlyStopUnchangedPages: earlyStopPages,
      isActive: formData.get("is_active") === "on",
    },
  };
}
