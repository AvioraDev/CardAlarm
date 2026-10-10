import { labelForCatalogueId } from "../../web/src/lib/catalogue-label";

describe("labelForCatalogueId", () => {
  const options = [
    { id: 1, label: "Victor Wembanyama" },
    { id: 22, label: "Anthony Edwards" },
  ];

  it("finds a label when ids are numbers on both sides", () => {
    expect(labelForCatalogueId(options, 22)).toBe("Anthony Edwards");
  });

  it("finds a label when option ids are strings (node-pg bigint) and the rule id is a number", () => {
    const fromPg = [
      { id: "1", label: "Victor Wembanyama" },
      { id: "22", label: "Anthony Edwards" },
    ];
    expect(labelForCatalogueId(fromPg, 1)).toBe("Victor Wembanyama");
    expect(labelForCatalogueId(fromPg, 22)).toBe("Anthony Edwards");
  });

  it("returns null for missing, empty or unknown ids", () => {
    expect(labelForCatalogueId(options, null)).toBeNull();
    expect(labelForCatalogueId(options, undefined)).toBeNull();
    expect(labelForCatalogueId(options, 0)).toBeNull();
    expect(labelForCatalogueId(options, 999)).toBeNull();
    expect(labelForCatalogueId([], 1)).toBeNull();
  });
});
