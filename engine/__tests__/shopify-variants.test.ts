import { summarizeVariants } from "../src/shopify-variants";

describe("summarizeVariants", () => {
  it("is available when any variant is in stock, not just the first", () => {
    const result = summarizeVariants([
      { price: "10.00", available: false },
      { price: "12.50", available: true },
    ]);
    expect(result).toEqual({ available: true, price: 12.5 });
  });

  it("uses the cheapest in-stock variant", () => {
    const result = summarizeVariants([
      { price: "30.00", available: true },
      { price: "9.99", available: true },
      { price: "1.00", available: false },
    ]);
    expect(result).toEqual({ available: true, price: 9.99 });
  });

  it("falls back to the first variant price when nothing is in stock", () => {
    expect(summarizeVariants([{ price: "7.00", available: false }])).toEqual({ available: false, price: 7 });
  });

  it("handles missing or malformed variants without throwing", () => {
    expect(summarizeVariants(undefined)).toEqual({ available: false, price: 0 });
    expect(summarizeVariants([{ price: "abc", available: true }])).toEqual({ available: true, price: 0 });
  });
});
