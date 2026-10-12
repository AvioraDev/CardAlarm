/**
 * Which classification the customer-facing readers read (D-008, CAR-94).
 *
 *   jev       the Jev classifier, current version, accepted and possible rows only (the default)
 *   standard  the Standard (deterministic) classifier, as before the switch
 *
 * Rolling back is one step: set CARDALARM_CLASSIFIER_READER=standard and restart. Standard rows are never touched.
 * engine/src/classifier-reader.ts is the same module for the engine; a test asserts they agree.
 */

/** Keep in step with JEV_CLASSIFIER_VERSION in the engine (a test asserts it). */
export const JEV_READER_VERSION = "jev-catalogue-v4";

export type ClassifierReader = "jev" | "standard";

export function classifierReader(env: Record<string, string | undefined> = process.env): ClassifierReader {
  return (env.CARDALARM_CLASSIFIER_READER ?? "jev").trim().toLowerCase() === "standard" ? "standard" : "jev";
}

/** SQL condition that selects the classification rows a reader may see. `alias` is the product_classifications alias. */
export function readerClassificationFilterSql(alias = "pc", reader: ClassifierReader = classifierReader()): string {
  if (reader === "standard") return `${alias}.classifier_type = 'deterministic'`;
  return `${alias}.classifier_type = 'jev' and ${alias}.classifier_version = '${JEV_READER_VERSION}' and ${alias}.review_status in ('accepted', 'possible')`;
}

/** The Standard rows have a separate match score; Jev rows carry their own. A Jev "possible" is always shown as possible. */
export function readerPossibleSql(alias = "pc"): string {
  return `(${alias}.classifier_type = 'jev' and ${alias}.review_status = 'possible')`;
}
