import { parseStoreForm } from "../../web/src/lib/store-form";

function makeForm(values: Record<string, string | boolean>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "boolean") {
      if (value) formData.append(key, "on");
    } else {
      formData.append(key, value);
    }
  }
  return formData;
}

describe("parseStoreForm", () => {
  it("normalizes valid Shopify store input", () => {
    const result = parseStoreForm(
      makeForm({
        name: "Example Cards",
        slug: "Example Cards",
        base_url: "https://example.com/store?utm=test#top",
        source_type: "shopify",
        country_code: "au",
        currency: "aud",
        scan_frequency_minutes: "60",
        is_active: true,
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        slug: "example-cards",
        name: "Example Cards",
        baseUrl: "https://example.com/store",
        sourceType: "shopify",
        countryCode: "AU",
        currency: "AUD",
        scanFrequencyMinutes: 60,
        isActive: true,
      },
    });
  });

  it("rejects invalid URLs", () => {
    const result = parseStoreForm(
      makeForm({
        name: "Bad URL Cards",
        slug: "bad-url-cards",
        base_url: "not-a-url",
        source_type: "shopify",
      }),
    );

    expect(result).toEqual({ ok: false, error: "A valid store URL is required." });
  });

  it("rejects unsupported source types", () => {
    const result = parseStoreForm(
      makeForm({
        name: "Other Platform",
        slug: "other-platform",
        base_url: "https://example.com",
        source_type: "magento",
      }),
    );

    expect(result).toEqual({ ok: false, error: "Only Shopify stores are supported for MVP scanning." });
  });

  it("rejects unsafe scan frequencies", () => {
    const result = parseStoreForm(
      makeForm({
        name: "Too Fast",
        slug: "too-fast",
        base_url: "https://example.com",
        source_type: "shopify",
        scan_frequency_minutes: "1",
      }),
    );

    expect(result).toEqual({ ok: false, error: "Scan frequency must be between 15 minutes and 7 days." });
  });
});
