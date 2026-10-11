import type { DbClient } from '../db';
import { runWithConcurrency } from '../ingest';
import { loadCatalogueIndex, type CatalogueIndex } from './catalogue-index';
import { classifyListing, JEV_CLASSIFIER_VERSION } from './classifier';
import { buildListingEvidence, evidenceHash } from './evidence';
import { createJevClient, type JevClient } from './jev-client';
import {
  loadPendingListings,
  markClassificationsChecked,
  saveClassifications,
  type ClassificationRecord,
  type ListingRow,
} from './store';

const SAVE_BATCH_SIZE = 200;

export interface PendingClassificationResult {
  classified: number;
  /** Content changed but the evidence the classifier reads did not (a price change, for example). */
  unchanged: number;
  failed: number;
  inputTokens: number;
}

export interface PendingClassificationDeps {
  limit?: number;
  concurrency?: number;
  jev?: JevClient;
  catalogue?: CatalogueIndex;
  loadListings?: (db: DbClient, limit: number) => Promise<ListingRow[]>;
  save?: (db: DbClient, records: ClassificationRecord[]) => Promise<number>;
  markChecked?: (db: DbClient, storeProductIds: number[]) => Promise<void>;
}

/**
 * Whether the scan worker should classify new and changed listings after each scan.
 *
 * Classifier v2 is opt-in (CARDALARM_JEV_CLASSIFIER_V2=true). It stays off until the v2 migration is applied
 * and the one-off reclassification has been approved: with the new version string every listing counts as
 * pending, so an unguarded worker would spend tokens and then fail to save the new statuses.
 */
export function jevClassificationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.CARDALARM_JEV_CLASSIFIER_V2 ?? 'false').toLowerCase() !== 'true') return false;
  if ((env.CARDALARM_JEV_CLASSIFY ?? 'true').toLowerCase() === 'false') return false;
  return Boolean(env.TYPESAFE_KEY || env.TYPESAFE_API_KEY);
}

export function pendingClassificationLimit(value: string | undefined = process.env.CARDALARM_JEV_CLASSIFY_LIMIT): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 2000;
}

/**
 * Classifies listings that are new or changed since they were last classified. Results are saved in
 * batches, so an interrupted run keeps what it finished and the next run picks up the rest.
 */
export async function classifyPendingListings(
  db: DbClient,
  deps: PendingClassificationDeps = {}
): Promise<PendingClassificationResult> {
  const loadListings = deps.loadListings ?? loadPendingListings;
  const save = deps.save ?? saveClassifications;
  const listings = await loadListings(db, deps.limit ?? pendingClassificationLimit());
  const result: PendingClassificationResult = { classified: 0, unchanged: 0, failed: 0, inputTokens: 0 };
  if (listings.length === 0) return result;

  const jev = deps.jev ?? createJevClient();
  const catalogue = deps.catalogue ?? (await loadCatalogueIndex(db));
  const unchangedIds: number[] = [];
  let buffer: ClassificationRecord[] = [];
  let saving: Promise<unknown> = Promise.resolve();

  const flush = (): void => {
    const batch = buffer;
    buffer = [];
    if (batch.length > 0) saving = saving.then(() => save(db, batch));
  };

  await runWithConcurrency(listings, deps.concurrency ?? 8, async listing => {
    const evidence = buildListingEvidence(listing);
    const hash = evidenceHash(evidence, JEV_CLASSIFIER_VERSION);
    if (listing.evidence_hash === hash) {
      result.unchanged++;
      unchangedIds.push(listing.id);
      return;
    }

    try {
      const classification = await classifyListing(evidence, catalogue, jev);
      result.classified++;
      result.inputTokens += classification.inputTokens;
      buffer.push({ storeProductId: listing.id, evidenceHash: hash, title: listing.title, classification });
      if (buffer.length >= SAVE_BATCH_SIZE) flush();
    } catch {
      // Left unclassified; the next run will pick it up again.
      result.failed++;
    }
  });

  flush();
  await saving;
  // Without this they would be re-selected on every run, because their snapshot stays newer than the row.
  await (deps.markChecked ?? markClassificationsChecked)(db, unchangedIds);
  return result;
}
