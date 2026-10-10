export type LabelledOption = { id: number | string; label: string };

/**
 * Resolve a catalogue id to its display label.
 *
 * Option ids come from node-pg, which returns bigint columns as strings, while rule ids come from the
 * Supabase REST client as numbers, so a strict `===` never matches in production. Compare as text.
 */
export function labelForCatalogueId(
  options: readonly LabelledOption[],
  id: number | string | null | undefined,
): string | null {
  if (id === null || id === undefined || id === "" || id === 0 || id === "0") return null;
  const wanted = String(id);
  return options.find((option) => String(option.id) === wanted)?.label || null;
}
