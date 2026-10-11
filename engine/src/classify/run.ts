import { closeDb, getDb } from '../db';
import { runWithConcurrency } from '../ingest';
import { loadCatalogueIndex, playerKey, storeProvidedNames } from './catalogue-index';
import { classifyListing, JEV_CLASSIFIER_VERSION, type ListingClassification } from './classifier';
import { buildListingEvidence, evidenceHash, titleOnlyEvidence } from './evidence';
import { createJevClient } from './jev-client';
import { loadListings, saveClassifications, type ClassificationRecord } from './store';

/**
 * Classifies available listings with Jev and stores the result alongside the deterministic classifier's.
 *
 * Usage:
 *   npx tsx --env-file=web/.env.local engine/src/classify/run.ts [options]
 *
 *   --limit N        listings to classify (default 200)
 *   --store SLUG     only this store
 *   --sample         spread the selection across the catalogue instead of taking the oldest rows
 *   --reclassify     include listings that already have a current classification
 *   --missing-product  reclassify basketball singles whose product was not in the catalogue. Run this
 *                    after importing more checklists.
 *   --dry-run        classify and report, but write nothing
 *   --title-only     hide store tags and product type from the classifier and compare its player against
 *                    the name the store published. Implies --dry-run. Measures accuracy, not coverage.
 *   --verbose        print one line per listing
 */

interface RunOptions {
  limit: number;
  store?: string;
  sample: boolean;
  reclassify: boolean;
  missingProduct: boolean;
  dryRun: boolean;
  titleOnly: boolean;
  verbose: boolean;
  concurrency: number;
}

function parseOptions(args: string[]): RunOptions {
  const value = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  const titleOnly = args.includes('--title-only');
  return {
    limit: Math.max(1, Number(value('--limit') ?? 200) || 200),
    store: value('--store'),
    sample: args.includes('--sample'),
    reclassify: args.includes('--reclassify') || args.includes('--missing-product') || titleOnly,
    missingProduct: args.includes('--missing-product'),
    dryRun: args.includes('--dry-run') || titleOnly,
    titleOnly,
    verbose: args.includes('--verbose'),
    concurrency: Math.min(16, Math.max(1, Number(value('--concurrency') ?? 6) || 6)),
  };
}

function describe(c: ListingClassification): string {
  if (c.itemType !== 'single_card' || c.sport !== 'basketball') return `${c.itemType}/${c.sport}`;
  const product = c.product ? `${c.product.season} ${c.product.productLine}` : '-';
  const parallel = c.parallelStatus === 'matched' ? c.parallel!.name : c.parallelStatus;
  return `${c.playerName ?? '-'} | ${product} | ${c.subset?.name ?? '-'} | ${parallel} | #${c.fields.cardNumber ?? '-'}${
    c.fields.serialLimit ? ` /${c.fields.serialLimit}` : ''
  }`;
}

function tally(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function printTally(title: string, counts: Map<string, number>): void {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  console.log(`\n${title}`);
  for (const [key, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(6)}  ${((count / total) * 100).toFixed(1).padStart(5)}%  ${key}`);
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const db = getDb();

  try {
    const jev = createJevClient();
    const catalogue = await loadCatalogueIndex(db);
    console.log(`Catalogue: ${catalogue.products.length} products, ${catalogue.playerCount} players.`);

    const listings = await loadListings(db, {
      limit: options.limit,
      store: options.store,
      sample: options.sample,
      includeClassified: options.reclassify,
      missingProductOnly: options.missingProduct,
    });
    console.log(`Classifying ${listings.length} listings${options.dryRun ? ' (dry run)' : ''}...`);

    const status = new Map<string, number>();
    const kinds = new Map<string, number>();
    const reasons = new Map<string, number>();
    const depth = new Map<string, number>();
    const records: ClassificationRecord[] = [];
    let inputTokens = 0;
    let requests = 0;
    let failures = 0;
    let comparable = 0;
    let agreed = 0;
    const disagreements: string[] = [];

    await runWithConcurrency(listings, options.concurrency, async listing => {
      const fullEvidence = buildListingEvidence(listing);
      const evidence = options.titleOnly ? titleOnlyEvidence(fullEvidence) : fullEvidence;

      let classification: ListingClassification;
      try {
        classification = await classifyListing(evidence, catalogue, jev);
      } catch (error) {
        failures++;
        console.error(`  ✗ #${listing.id}: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      inputTokens += classification.inputTokens;
      requests += classification.jevRequests;
      tally(status, classification.reviewStatus);
      tally(kinds, `${classification.itemType} / ${classification.sport}`);
      for (const reason of classification.reviewReasons) tally(reasons, reason);
      if (classification.itemType === 'single_card' && classification.sport === 'basketball') {
        tally(depth, classification.playerName ? 'player resolved' : 'player missing');
        tally(depth, classification.product ? 'product resolved' : 'product missing');
        if (classification.product) {
          tally(depth, classification.subset ? 'subset resolved' : 'subset missing');
          tally(depth, `parallel ${classification.parallelStatus}`);
        }
      }

      if (options.titleOnly) {
        // The store's own tag is the reference: did the classifier find the same person from the title alone?
        const published = storeProvidedNames(fullEvidence.tags, fullEvidence.productType)[0];
        if (published && classification.itemType === 'single_card' && classification.sport === 'basketball') {
          comparable++;
          const same =
            classification.playerName !== null &&
            playerKey(classification.playerName) === playerKey(published);
          if (same) agreed++;
          else if (disagreements.length < 40) {
            disagreements.push(`  store="${published}" jev="${classification.playerName ?? '-'}"  ${listing.title}`);
          }
        }
      }

      if (options.verbose) {
        console.log(`  [${classification.reviewStatus}] ${listing.title}\n      -> ${describe(classification)}`);
      }
      records.push({
        storeProductId: listing.id,
        evidenceHash: evidenceHash(fullEvidence, JEV_CLASSIFIER_VERSION),
        title: listing.title,
        classification,
      });
    });

    if (!options.dryRun) {
      for (let start = 0; start < records.length; start += 200) {
        await saveClassifications(db, records.slice(start, start + 200));
      }
    }

    printTally('Review status', status);
    printTally('Item type / sport', kinds);
    printTally('Basketball singles: how far each got', depth);
    printTally('Review reasons', reasons);
    if (options.titleOnly) {
      console.log(`\nPlayer agreement with store-published name (title only): ${agreed}/${comparable}`);
      if (disagreements.length > 0) console.log(disagreements.join('\n'));
    }
    console.log(
      `\n${records.length} classified, ${failures} failed, ${requests} Jev requests, ${inputTokens} input tokens. ${
        options.dryRun ? 'Nothing written.' : `${records.length} rows saved.`
      }`
    );
  } finally {
    await closeDb();
  }
}

main().catch(error => {
  console.error('Classification run failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
