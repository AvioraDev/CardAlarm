import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const appDir = join(__dirname, "..", "..", "web", "src", "app");

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "admin" || entry === "api" ? [] : collect(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/** Strip imports and identifiers that legitimately contain internal words so only visible copy remains. */
function visibleSource(source: string): string {
  return source
    .replace(/^import .*$/gm, "")
    // Raw engine reasons are sample input to customerReasons(), which rewrites them before display.
    .replace(/^.*match_reasons:.*$/gm, "")
    .replace(/[A-Za-z]*[Bb]ackfill[A-Za-z]*(Action)?/g, "")
    .replace(/canonical_url/g, "");
}

describe("customer copy rules", () => {
  const files = collect(appDir);

  it("finds customer files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [file.slice(appDir.length + 1), file]))(
    "%s has no banned customer wording",
    (_name, file) => {
      const text = visibleSource(readFileSync(file, "utf8"));
      expect(text).not.toMatch(/\bbackfill\b|canonical|\bMVP\b|cached listings|Serialized/i);
    }
  );

  it("does not combine uppercase text with button classes", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/className="[^"]*\bbtn\b[^"]*\buppercase\b/);
    }
  });
});
