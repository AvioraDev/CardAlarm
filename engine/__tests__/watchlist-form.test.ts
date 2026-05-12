import {
  parseBooleanState,
  parsePositiveFormId,
  parseWatchlistForm,
} from "../../web/src/lib/watchlist-form";

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

describe("watchlist form validation", () => {
  it("normalizes valid watchlist input", () => {
    const result = parseWatchlistForm(
      makeForm({
        name: "  Kevin Durant Prizm  ",
        include_terms: "Kevin Durant, KD",
        exclude_terms: "break, spot",
        brand: "Panini",
        product_line: "Prizm",
        season: "2023-24",
        card_number: "12",
        parallel: "Silver",
        rookie_only: false,
        autograph_only: true,
        serial_numbered_only: true,
        min_price: "10.129",
        max_price: "250",
        currency: "nzd",
        minimum_match_confidence: "0.8",
        notification_enabled: true,
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        name: "Kevin Durant Prizm",
        includeTerms: "Kevin Durant, KD",
        excludeTerms: "break, spot",
        brand: "Panini",
        productLine: "Prizm",
        season: "2023-24",
        cardNumber: "12",
        parallel: "Silver",
        autographOnly: true,
        serialNumberedOnly: true,
        minPrice: 10.13,
        maxPrice: 250,
        currency: "NZD",
        minimumMatchConfidence: 0.8,
        notificationEnabled: true,
      }),
    });
  });

  it("rejects unsafe watchlist form values", () => {
    expect(parseWatchlistForm(makeForm({ name: "" }))).toEqual({
      ok: false,
      error: "Watchlist name is required.",
    });
    expect(parseWatchlistForm(makeForm({ name: "KD", min_price: "500", max_price: "100" }))).toEqual({
      ok: false,
      error: "Minimum price cannot be higher than maximum price.",
    });
    expect(parseWatchlistForm(makeForm({ name: "KD", minimum_match_confidence: "3" }))).toEqual({
      ok: false,
      error: "Minimum confidence must be between 0 and 1.",
    });
    expect(parseWatchlistForm(makeForm({ name: "KD", rookie_only: "yes" }))).toEqual({
      ok: false,
      error: "Rookie only is invalid.",
    });
  });

  it("validates positive ids and boolean state fields strictly", () => {
    expect(parsePositiveFormId(makeForm({ watchlistId: "123" }), "watchlistId")).toBe(123);
    expect(parsePositiveFormId(makeForm({ watchlistId: "1abc" }), "watchlistId")).toBeNull();
    expect(parsePositiveFormId(makeForm({ watchlistId: "0" }), "watchlistId")).toBeNull();
    expect(parseBooleanState(makeForm({ isActive: "true" }), "isActive")).toBe(true);
    expect(parseBooleanState(makeForm({ isActive: "false" }), "isActive")).toBe(false);
    expect(parseBooleanState(makeForm({ isActive: "on" }), "isActive")).toBeNull();
  });
});
