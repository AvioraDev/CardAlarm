import { createHash } from 'node:crypto';

/**
 * Everything a store tells us about a listing, in one shape for every source. Stores publish far more
 * than the title: sport, brand and grader tags, and sometimes the player as a tag or product type.
 */
export interface ListingEvidence {
  store: string;
  title: string;
  tags: string[];
  vendor: string | null;
  productType: string | null;
  description: string | null;
}

export interface ListingEvidenceSource {
  source: string;
  title: string;
  description?: string | null;
  raw_latest_payload?: unknown;
}

const MAX_TAGS = 20;
const MAX_DESCRIPTION_LENGTH = 240;
// Store housekeeping tags that say nothing about the card.
const NOISE_TAG_PATTERN = /^(\d+|\d+-\d+|in-stock|single|availability_.*|afterpay.*|max\d+|under-.*|over-.*|new|sale)$/i;

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const tags = raw.map(cleanText).filter(tag => tag !== '' && !NOISE_TAG_PATTERN.test(tag));
  return [...new Set(tags)].slice(0, MAX_TAGS);
}

export function buildListingEvidence(row: ListingEvidenceSource): ListingEvidence {
  const payload = (row.raw_latest_payload && typeof row.raw_latest_payload === 'object' ? row.raw_latest_payload : {}) as Record<
    string,
    unknown
  >;
  const description = stripHtml(row.description ?? cleanText(payload.body_html)).slice(0, MAX_DESCRIPTION_LENGTH);

  return {
    store: row.source,
    title: cleanText(row.title),
    tags: parseTags(payload.tags),
    vendor: cleanText(payload.vendor) || null,
    productType: cleanText(payload.product_type) || null,
    description: description || null,
  };
}

/** Drops everything but the title. Used to measure how much the classifier depends on store tags. */
export function titleOnlyEvidence(evidence: ListingEvidence): ListingEvidence {
  return { ...evidence, tags: [], vendor: null, productType: null, description: null };
}

/** Changes whenever the evidence or the classifier version changes, so stale classifications are redone. */
export function evidenceHash(evidence: ListingEvidence, classifierVersion: string): string {
  return createHash('sha256').update(JSON.stringify({ classifierVersion, evidence })).digest('hex');
}

/** The state sent to Jev: only fields that carry signal, under names the questions refer to. */
export function evidenceState(evidence: ListingEvidence): Record<string, unknown> {
  const state: Record<string, unknown> = { title: evidence.title };
  if (evidence.tags.length > 0) state.tags = evidence.tags;
  if (evidence.productType) state.product_type = evidence.productType;
  if (evidence.vendor) state.vendor = evidence.vendor;
  if (evidence.description) state.description = evidence.description;
  return state;
}
