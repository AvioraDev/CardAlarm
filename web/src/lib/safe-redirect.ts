/**
 * Returns a same-origin path for post-auth redirects, or the fallback.
 * Rejects protocol-relative (`//host`), backslash (`/\host`) and control-character
 * tricks that browsers normalise into off-site URLs.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (value.startsWith("//")) return fallback;
  try {
    const base = "http://cardalarm.invalid";
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
