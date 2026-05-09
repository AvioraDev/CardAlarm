import {
  buildMatchedSourceProductBatchRows,
  markSourceProductsMatched,
  type DbClient,
} from '../src/db';

function mockDb(): DbClient & { query: jest.Mock } {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as DbClient & { query: jest.Mock };
}

describe('buildMatchedSourceProductBatchRows', () => {
  it('deduplicates by external id and keeps the latest content hash', () => {
    const rows = buildMatchedSourceProductBatchRows([
      { externalId: '100', contentHash: 'old-hash' },
      { externalId: '200', contentHash: 'stable-hash' },
      { externalId: '100', contentHash: 'latest-hash' },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.external_id === '100')).toEqual({
      external_id: '100',
      content_hash: 'latest-hash',
    });
    expect(rows.find(row => row.external_id === '200')).toEqual({
      external_id: '200',
      content_hash: 'stable-hash',
    });
  });
});

describe('markSourceProductsMatched', () => {
  it('returns without querying when there are no matches', async () => {
    const db = mockDb();

    await markSourceProductsMatched(db, 'topplay', [], 'context-hash');

    expect(db.query).not.toHaveBeenCalled();
  });

  it('updates matched hashes in one batched SQL statement', async () => {
    const db = mockDb();

    await markSourceProductsMatched(
      db,
      'topplay',
      [
        { externalId: '100', contentHash: 'old-hash' },
        { externalId: '200', contentHash: 'stable-hash' },
        { externalId: '100', contentHash: 'latest-hash' },
      ],
      'context-hash'
    );

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain('jsonb_to_recordset');
    expect(sql).toContain('update source_products');
    expect(sql).toContain('last_matched_hash = input.content_hash');
    expect(sql).toContain('last_matched_context_hash = $2');
    expect(params[1]).toBe('context-hash');
    expect(params[2]).toBe('topplay');

    const payload = JSON.parse(params[0] as string) as { external_id: string; content_hash: string }[];
    expect(payload).toHaveLength(2);
    expect(payload.find(row => row.external_id === '100')).toEqual({
      external_id: '100',
      content_hash: 'latest-hash',
    });
  });
});
