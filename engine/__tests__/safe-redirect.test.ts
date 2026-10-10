import { safeRedirectPath } from "../../web/src/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/watchlists", "/watchlists"],
    ["/dashboard?brand=Prizm", "/dashboard?brand=Prizm"],
    ["/watchlists/3#rules", "/watchlists/3#rules"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "dashboard",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "https://evil.com",
    "javascript:alert(1)",
  ])("falls back for %p", (input) => {
    expect(safeRedirectPath(input)).toBe("/dashboard");
  });

  it("uses a custom fallback", () => {
    expect(safeRedirectPath("//evil.com", "/login")).toBe("/login");
  });
});
