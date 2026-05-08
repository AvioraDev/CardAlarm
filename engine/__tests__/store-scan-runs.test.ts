import {
  createStoreScanRun,
  markStoreScanFailed,
  markStoreScanSucceeded,
  updateStoreScanRun,
} from '../src/db';
import type { DbClient } from '../src/db';

function mockDb(): DbClient & { query: jest.Mock } {
  return {
    query: jest.fn().mockResolvedValue({ rows: [{ id: 42 }] }),
  } as unknown as DbClient & { query: jest.Mock };
}

describe('store scan run persistence', () => {
  it('creates a per-store scan run with store id and slug', async () => {
    const db = mockDb();

    await expect(createStoreScanRun(db, { storeId: 7, slug: 'topplay' })).resolves.toBe(42);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into store_scan_runs'),
      [7, 'topplay'],
    );
  });

  it('updates completed store scan counts and metadata', async () => {
    const db = mockDb();

    await updateStoreScanRun(db, 42, {
      status: 'completed',
      productsSeen: 100,
      productsProcessed: 25,
      productsMatched: 12,
      productsMarkedUnavailable: 3,
      metadata: { skipped: 75 },
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('products_matched'),
      ['completed', 100, 25, 12, 3, JSON.stringify({ skipped: 75 }), 42],
    );
  });

  it('updates store success and failure timestamps only when a store id exists', async () => {
    const db = mockDb();

    await markStoreScanSucceeded(db, 7);
    await markStoreScanFailed(db, 8);
    await markStoreScanSucceeded(db, null);

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('last_successful_scan_at'),
      [7],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('last_failed_scan_at'),
      [8],
    );
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});
