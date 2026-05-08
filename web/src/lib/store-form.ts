export type StoreFormInput = {
  slug: string;
  name: string;
  baseUrl: string;
  sourceType: string;
  countryCode: string;
  currency: string;
  scanFrequencyMinutes: number;
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
  if (!["http:", "https:"].includes(parsedUrl.protocol)) return { ok: false, error: "Store URL must use http or https." };
  if (!Number.isInteger(scanFrequency) || scanFrequency < 15 || scanFrequency > 10080) {
    return { ok: false, error: "Scan frequency must be between 15 minutes and 7 days." };
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
      isActive: formData.get("is_active") === "on",
    },
  };
}
