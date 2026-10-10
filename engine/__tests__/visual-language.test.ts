import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const appDir = join(__dirname, "..", "..", "web", "src", "app");

// Admin-only components that live under components/ (customer pages must never import them: see scan-architecture.test.ts).
const ADMIN_ONLY = new Set(["scan-panel.tsx"]);

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "admin" || entry === "api" ? [] : collect(full);
    return full.endsWith(".tsx") && !ADMIN_ONLY.has(entry) ? [full] : [];
  });
}

/** The 'Catalogue' visual language: customer files must not drift back to the old SaaS look. */
const BANNED: Array<[string, RegExp]> = [
  ["rounded-2xl / rounded-3xl / rounded-full (use rounded-tag, rounded-control or rounded-card)", /\brounded-(2xl|3xl|full)\b/],
  ["shadow-card (the design is flat)", /\bshadow-card\b/],
  ["gradients (hairlines and tone only)", /radial-gradient|bg-gradient|linear-gradient/],
  ["text under 12px", /text-\[(9|10|11)px\]/],
  ["alpha-blended text colour", /\btext-text-muted\/\d+|\btext-text\/\d+/],
  ["glyph icons (use components/icons.tsx)", /[✓✗✕←→↗⚠]/],
  ["emoji", /\p{Extended_Pictographic}/u],
  ["per-file accent-[var(...)] (lives in global CSS)", /accent-\[var\(/],
  ["uppercase text", /\buppercase\b/],
];

describe("visual language (customer files)", () => {
  const files = collect(appDir);

  it("finds customer files to check", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files.map((file) => [file.slice(appDir.length + 1), file]))("%s follows the Catalogue language", (_name, file) => {
    const source = readFileSync(file, "utf8");
    const found = BANNED.filter(([, pattern]) => pattern.test(source)).map(([label]) => label);
    expect(found).toEqual([]);
  });
});
