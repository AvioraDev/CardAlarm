import { CatalogueIndex } from '../src/classify/catalogue-index';
import { JEV_CLASSIFIER_VERSION } from '../src/classify/classifier';
import { buildListingEvidence, evidenceHash } from '../src/classify/evidence';
import type { JevClient, JevResponse } from '../src/classify/jev-client';
import { classifyPendingListings, jevClassificationEnabled, pendingClassificationLimit } from '../src/classify/pending';
import type { ClassificationRecord, ListingRow } from '../src/classify/store';
import { classificationRow } from '../src/classify/store';
import { runWorkerOnce } from '../src/worker';
import type { ScanJobRow } from '../src/scan-jobs';
import type { SourceConfig } from '../src/types';

const catalogue = new CatalogueIndex({ products: [] });

/** Answers every Choice with its first option: a single card, basketball, and the first name offered. */
function firstOptionJev(failOnTitle?: string): JevClient {
  return {
    async ask(state, questions): Promise<JevResponse> {
      if (failOnTitle && (state as { title: string }).title === failOnTitle) throw new Error('Jev unavailable');
      const answers: JevResponse['answers'] = {};
      for (const [id, question] of Object.entries(questions)) {
        if (question.type !== 'choice') continue;
        const choice = Object.keys(question.criteria)[0]!;
        answers[id] = { type: 'choice', choice, confidence: 1, probabilities: { [choice]: 1 } };
      }
      return { model: 'jev-test', answers, usage: { input_tokens: 50, output_tokens: 0 } };
    },
  };
}

function listing(id: number, title: string, evidence_hash: string | null = null): ListingRow {
  return { id, source: 'spnz', title, description: null, raw_latest_payload: { tags: ['Reggie Miller', 'Raw'] }, evidence_hash };
}

describe('classifying new and changed listings', () => {
  it('classifies pending listings and saves them', async () => {
    const saved: ClassificationRecord[] = [];
    const result = await classifyPendingListings({} as never, {
      jev: firstOptionJev(),
      catalogue,
      loadListings: async () => [listing(1, '1994 Topps Finest #106 Reggie Miller'), listing(2, '1991 Skybox #114 Reggie Miller')],
      save: async (_db, records) => saved.push(...records),
      markChecked: async () => undefined,
    });

    expect(result).toMatchObject({ classified: 2, unchanged: 0, failed: 0, inputTokens: 100 });
    expect(saved.map(record => record.storeProductId).sort()).toEqual([1, 2]);
    expect(saved[0]!.classification).toMatchObject({ itemType: 'single_card', sport: 'basketball', playerName: 'Reggie Miller' });
  });

  it('skips listings whose evidence has not changed and marks them as checked', async () => {
    const title = '1994 Topps Finest #106 Reggie Miller';
    const hash = evidenceHash(buildListingEvidence(listing(1, title)), JEV_CLASSIFIER_VERSION);
    const checked: number[][] = [];
    const save = jest.fn(async () => 0);

    const result = await classifyPendingListings({} as never, {
      jev: firstOptionJev(),
      catalogue,
      loadListings: async () => [listing(1, title, hash)],
      save,
      markChecked: async (_db, ids) => void checked.push(ids),
    });

    expect(result).toMatchObject({ classified: 0, unchanged: 1 });
    expect(save).not.toHaveBeenCalled();
    expect(checked).toEqual([[1]]);
  });

  it('keeps going when one listing fails and leaves it for the next run', async () => {
    const saved: ClassificationRecord[] = [];
    const result = await classifyPendingListings({} as never, {
      jev: firstOptionJev('broken listing'),
      catalogue,
      loadListings: async () => [listing(1, 'broken listing'), listing(2, '1991 Skybox #114 Reggie Miller')],
      save: async (_db, records) => saved.push(...records),
      markChecked: async () => undefined,
    });

    expect(result).toMatchObject({ classified: 1, failed: 1 });
    expect(saved.map(record => record.storeProductId)).toEqual([2]);
  });

  it('does nothing, and needs no API key, when nothing is pending', async () => {
    const result = await classifyPendingListings({} as never, { loadListings: async () => [] });
    expect(result).toEqual({ classified: 0, unchanged: 0, failed: 0, inputTokens: 0 });
  });

  it('is enabled only with an API key and can be switched off', () => {
    expect(jevClassificationEnabled({})).toBe(false);
    expect(jevClassificationEnabled({ TYPESAFE_KEY: 'k' })).toBe(true);
    expect(jevClassificationEnabled({ TYPESAFE_KEY: 'k', CARDALARM_JEV_CLASSIFY: 'false' })).toBe(false);
    expect(pendingClassificationLimit(undefined)).toBe(2000);
    expect(pendingClassificationLimit('250')).toBe(250);
    expect(pendingClassificationLimit('nope')).toBe(2000);
  });

  it('writes catalogue ids and keeps the legacy text columns filled', async () => {
    const saved: ClassificationRecord[] = [];
    await classifyPendingListings({} as never, {
      jev: firstOptionJev(),
      catalogue,
      loadListings: async () => [listing(7, '1994 Topps Finest #106 Reggie Miller /99')],
      save: async (_db, records) => saved.push(...records),
      markChecked: async () => undefined,
    });

    expect(classificationRow(saved[0]!)).toMatchObject({
      store_product_id: 7,
      classifier_type: 'jev',
      classifier_version: JEV_CLASSIFIER_VERSION,
      item_type: 'single_card',
      sport: 'basketball',
      category: 'NBA',
      year: '1994',
      card_number: '106',
      player_name: 'Reggie Miller',
      is_serial: true,
      serial_limit: '99',
      review_status: 'accepted',
      checklist_product_id: null,
    });
  });
});

describe('scan worker classification step', () => {
  class FakeDb {
    readonly calls: string[] = [];
    constructor(private readonly job: ScanJobRow) {}
    async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
      this.calls.push(sql);
      return sql.includes('update public.scan_jobs sj') ? { rows: [this.job], rowCount: 1 } : { rows: [], rowCount: 1 };
    }
  }
  const job: ScanJobRow = { id: 1, scan_run_id: 2, mode: 'watchlist', status: 'running', locked_by: 'w', attempts: 1, max_attempts: 3, metadata: {} };
  const source: SourceConfig = {
    slug: 'topplay',
    name: 'TopPlay',
    baseUrl: 'https://example.com',
    sourceType: 'shopify',
    countryCode: 'NZ',
    currency: 'NZD',
    scanStrategy: 'incremental',
    earlyStopEnabled: true,
    earlyStopUnchangedPages: 2,
  };

  it('classifies before watchlists are reconciled', async () => {
    const classifyPending = jest.fn(async () => ({ classified: 3, unchanged: 0, failed: 0, inputTokens: 900 }));
    const logger = { info: jest.fn(), error: jest.fn() };

    const result = await runWorkerOnce(new FakeDb(job) as never, {
      workerId: 'w',
      heartbeatIntervalMs: 0,
      logger,
      loadSources: async () => [source],
      runCycle: async (_db, _sources, options) => {
        await options?.beforeReconcile?.();
        return { processed: 1, matched: 0 };
      },
      classifyPending,
    });

    expect(result.succeeded).toBe(true);
    expect(classifyPending).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('Classified 3 listings with Jev (0 failed, 900 input tokens).');
  });

  it('does not fail the scan job when classification fails', async () => {
    const db = new FakeDb(job);
    const logger = { info: jest.fn(), error: jest.fn() };

    const result = await runWorkerOnce(db as never, {
      workerId: 'w',
      heartbeatIntervalMs: 0,
      logger,
      loadSources: async () => [source],
      runCycle: async (_db, _sources, options) => {
        await options?.beforeReconcile?.();
        return { processed: 1, matched: 0 };
      },
      classifyPending: async () => {
        throw new Error('Jev unavailable');
      },
    });

    expect(result).toEqual({ claimed: true, succeeded: true, scanJobId: 1 });
    expect(logger.error).toHaveBeenCalledWith('Listing classification failed: Jev unavailable');
    expect(db.calls.some(sql => sql.includes("set status = 'failed'"))).toBe(false);
  });
});
