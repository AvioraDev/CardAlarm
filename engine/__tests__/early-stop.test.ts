import { earlyStopConfigForSource, shouldStopForUnchangedPages } from '../src/ingest';
import type { SourceConfig } from '../src/types';

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
