const KNOWN_ERRORS: Record<string, string> = {
  "missing-fields": "Please fill in every field.",
  "invalid-credentials": "That email or password doesn't look right.",
};

/** Turns an error query value (already URL-decoded by Next) into safe, readable copy. */
export function friendlyError(code: string): string {
  const trimmed = code.trim().slice(0, 300);
  return KNOWN_ERRORS[trimmed] ?? trimmed;
}
