jest.mock('../src/db', () => ({ reconcileSourceAvailability: jest.fn() }));

import { runAvailabilityCheck } from '../src/availability';
import { reconcileSourceAvailability } from '../src/db';
import type { DbClient } from '../src/db';
import type { SourceConfig } from '../src/types';

const source: SourceConfig = {
  slug: 'test', name: 'Test', baseUrl: 'https://example.com/',
  sourceType: 'shopify', countryCode: 'NZ', currency: 'NZD',
  scanStrategy: 'full', earlyStopEnabled: false, earlyStopUnchangedPages: 2,
};
const reconcile = jest.mocked(reconcileSourceAvailability);
const originalFetch = global.fetch;

beforeEach(() => {
  jest.useFakeTimers();
  reconcile.mockResolvedValue(0);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it.each([
  null, {}, { products: null }, { products: {} },
  { products: [null] },
  { products: [{ id: 1, variants: [{ available: 'false' }] }] },
  { products: [{ variants: [] }] },
])('preserves inventory when the response is malformed: %j', async payload => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload });
  expect(await runAvailabilityCheck({} as DbClient, [source])).toEqual({ checked: 0, markedOOS: 0 });
  expect(reconcile).not.toHaveBeenCalled();
});

it('reconciles an explicitly empty catalogue', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ products: [] }) });
  const result = runAvailabilityCheck({} as DbClient, [source]);
  await jest.runAllTimersAsync();
  await result;
  expect(reconcile).toHaveBeenCalledWith({}, 'test', []);
  expect(global.fetch).toHaveBeenCalledWith(
    'https://example.com/products.json?limit=250&page=1',
    { signal: expect.any(AbortSignal) },
  );
});

it('preserves inventory after a network failure', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('Timed out'));
  await runAvailabilityCheck({} as DbClient, [source]);
  expect(reconcile).not.toHaveBeenCalled();
});

it('preserves inventory when a later page is malformed', async () => {
  const products = Array.from({ length: 250 }, (_, id) => ({ id, variants: [{ available: true }] }));
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ products }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ error: 'Store unavailable' }) });
  const result = runAvailabilityCheck({} as DbClient, [source]);
  await jest.runAllTimersAsync();
  await result;
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(reconcile).not.toHaveBeenCalled();
});

it('preserves inventory after an HTTP failure', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
  await runAvailabilityCheck({} as DbClient, [source]);
  expect(reconcile).not.toHaveBeenCalled();
});
