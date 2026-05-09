import {
  buildSourceScanMetadata,
  earlyStopConfigForSource,
  scanDelayConfig,
  scanPageConcurrency,
  shouldStopForUnchangedPages,
  stopReasonForPageResult,
} from '../src/ingest';
import type { SourceConfig } from '../src/types';
import type { SourceScanProgress } from '../src/ingest';

function source(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    slug: 'topplay',
    name: 'TopPlay',
    baseUrl: 'https://example.com',
    sourceType: 'shopify',
    countryCode: 'NZ',
    currency: 'NZD',
    scanStrategy: 'incremental',
    earlyStopEnabled: true,
    earlyStopUnchangedPages: 2,
    ...overrides,
  };
}

describe('incremental scan early stop', () => {
  it('stops only after the configured number of unchanged full pages', () => {
    const config = earlyStopConfigForSource(source({ earlyStopUnchangedPages: 2 }));

    expect(shouldStopForUnchangedPages(config, 1)).toBe(false);
    expect(shouldStopForUnchangedPages(config, 2)).toBe(true);
  });

  it('does not early-stop full strategy stores', () => {
    const config = earlyStopConfigForSource(source({ scanStrategy: 'full', earlyStopEnabled: true }));

    expect(config.enabled).toBe(false);
    expect(shouldStopForUnchangedPages(config, 10)).toBe(false);
  });

  it('does not early-stop when disabled for an incremental store', () => {
    const config = earlyStopConfigForSource(source({ earlyStopEnabled: false }));

    expect(config.enabled).toBe(false);
    expect(shouldStopForUnchangedPages(config, 10)).toBe(false);
  });
});

describe('scan performance controls', () => {
  it('clamps page concurrency between one and five', () => {
    expect(scanPageConcurrency('0')).toBe(1);
    expect(scanPageConcurrency('3')).toBe(3);
    expect(scanPageConcurrency('10')).toBe(5);
    expect(scanPageConcurrency('invalid')).toBe(1);
  });

  it('allows zero scan delay values', () => {
    expect(scanDelayConfig('0', '0')).toEqual({ minMs: 0, maxMs: 0 });
  });

  it('treats max scan delay lower than min as min', () => {
    expect(scanDelayConfig('500', '100')).toEqual({ minMs: 500, maxMs: 500 });
  });

  it('maps feed page results to scan stop reasons', () => {
    expect(stopReasonForPageResult(null)).toBe('fetch_error');
    expect(stopReasonForPageResult([])).toBe('empty_page');
    expect(stopReasonForPageResult([{} as never], 100)).toBe('partial_page');
    expect(stopReasonForPageResult(Array.from({ length: 100 }, () => ({} as never)), 100)).toBeNull();
  });
});

describe('scan progress metadata', () => {
  function progress(overrides: Partial<SourceScanProgress> = {}): SourceScanProgress {
    return {
      skipped: 2,
      scanStrategy: 'incremental',
      earlyStopEnabled: true,
      earlyStopUnchangedPages: 2,
      stoppedEarly: false,
      pagesFetched: 4,
      lastPageFetched: 4,
      stopReason: null,
      fetchDurationMs: 100,
      cacheDurationMs: 200,
      matchDurationMs: 300,
      postScanDurationMs: 0,
      totalDurationMs: 600,
      ...overrides,
    };
  }

  it('adds live phase without dropping known progress fields', () => {
    expect(buildSourceScanMetadata('matching', progress())).toMatchObject({
      phase: 'matching',
      pagesFetched: 4,
      lastPageFetched: 4,
      fetchDurationMs: 100,
      cacheDurationMs: 200,
      matchDurationMs: 300,
    });
  });

  it('preserves completed stop reason and post-scan timing', () => {
    expect(
      buildSourceScanMetadata(
        'completed',
        progress({ stopReason: 'partial_page', postScanDurationMs: 50, totalDurationMs: 650 })
      )
    ).toMatchObject({
      phase: 'completed',
      stopReason: 'partial_page',
      postScanDurationMs: 50,
      totalDurationMs: 650,
    });
  });
});
