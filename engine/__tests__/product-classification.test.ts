import fs from 'node:fs';
import path from 'node:path';
import { parseBackfillArgs, toClassificationCacheInput } from '../src/backfill-product-classifications';
import {
  buildProductClassificationRows,
  DETERMINISTIC_CLASSIFIER_TYPE,
  DETERMINISTIC_CLASSIFIER_VERSION,
  findBasketballCardProductSignal,
  isLikelyNbaCardTitle,
  isLikelyTradingCardTitle,
} from '../src/product-classification';
import type { SourceProductCacheInput } from '../src/types';

function product(overrides: Partial<SourceProductCacheInput> = {}): SourceProductCacheInput {
  return {
    storeId: 42,
    source: 'topplay',
    externalId: '1',
    handle: 'kevin-durant-prizm-silver',
    title: '2023-24 Panini Prizm Basketball Silver #12 Kevin Durant',
    price: 25,
    available: true,
    url: 'https://example.com/products/kevin-durant-prizm-silver',
    imageUrl: 'https://example.com/image.jpg',
    description: 'Card description',
    rawPayload: JSON.stringify({ id: 1 }),
    contentHash: 'hash-1',
    scanToken: 'scan-1',
    ...overrides,
  };
}

describe('deterministic product classifications', () => {
  it('builds classification rows from cached products', () => {
    expect(buildProductClassificationRows([product()])).toEqual([
      expect.objectContaining({
        source: 'topplay',
        external_id: '1',
        classifier_version: DETERMINISTIC_CLASSIFIER_VERSION,
        classifier_type: DETERMINISTIC_CLASSIFIER_TYPE,
        status: 'classified',
        year: '2023-24',
        product_line: 'Panini Prizm Basketball',
        set_name: 'Panini Prizm Basketball',
        card_number: '12',
        player_name: 'Kevin Durant',
        variant_name: 'Silver',
        parallel_name: 'Silver',
        insert_name: null,
        is_rookie: false,
        is_auto: false,
        is_serial: false,
        category: 'NBA',
      }),
    ]);
  });

  it.each([
    '2024-25 Panini Hoops #165 Victor Wembanyama',
    '2023-24 Panini Donruss Optic #225 Victor Wembanyama Rookie Card Rated Rookie',
    '2022-23 Panini Mosaic #98 Lebron James',
    '2025 Topps Chrome #221 Victor Wembanyama Red White Blue Refractor',
  ])('classifies likely NBA card titles: %s', title => {
    const [row] = buildProductClassificationRows([product({ title })]);

    expect(isLikelyTradingCardTitle(title)).toBe(true);
    expect(isLikelyNbaCardTitle(title)).toBe(true);
    expect(row).toMatchObject({
      category: 'NBA',
      raw_signals: expect.objectContaining({
        isLikelyCard: true,
        isLikelyNba: true,
        rejectedReason: null,
      }),
    });
    expect(row?.set_name ?? row?.product_line).not.toBeNull();
  });

  it.each([
    '2018-19 Panini Spectra Rising Stars Holo Rookie Auto /75',
    '2020 Panini Prizm Red White Blue RC PSA 9',
    '2020-21 Donruss Optic Rated Rookie Silver Auto',
    '2020-21 Hoops Rookie Ink',
    '2022 Donruss Optic Gold /10',
    '2022 Donruss Optic Photon SSP',
    '2023 Panini Chronicles Kaboom SSP',
    '2023 Prizm Colorblast',
    '2022-23 Panini Obsidian Orbital Electric Etch Orange /35',
    '2023-24 Panini Flawless #LS-JWL Jason Williams Legendary On Card Autograph 05/25',
    '2019-20 Panini One And One #DJA-JWL Jason Williams Game Worn Patch On Card Autograph 23/49',
    '2024-25 Panini Noir #331 Bub Carrington RPA On Card Patch Autograph 49/49',
    '2023-24 Panini Impeccable #RS-LIV Dereck Lively II Rookie Card On Card Autograph 88/90',
    '2023-24 Panini Phoenix #RJA GG Jackson II Rookie Card RPA 174/199',
    '2023-24 Panini Photogenic #RS-OMP Oliver-Maxence Prosper Rookie Card Autograph Gold 07/10',
    '2009 Panini Prestige #151 Blake Griffin Rookie Card',
    '2015-16 Panini Complete #296 Devin Booker Complete Rookie Card',
  ])('uses card-store product signals for NBA recall: %s', title => {
    const [row] = buildProductClassificationRows([product({ title, source: 'spnz' })]);

    expect(isLikelyTradingCardTitle(title)).toBe(true);
    expect(isLikelyNbaCardTitle(title, 'spnz')).toBe(true);
    expect(row).toMatchObject({
      category: 'NBA',
      raw_signals: expect.objectContaining({
        isLikelyCard: true,
        isLikelyNba: true,
        rejectedReason: null,
        nonNbaSportSignal: null,
        nonCardSignal: null,
        sourceCategoryBoost: true,
      }),
    });
    expect(row?.raw_signals.nbaSignal).toEqual(expect.any(String));
  });

  it('can boost from parsed product_line evidence', () => {
    expect(findBasketballCardProductSignal('Rookie Auto /75', 'Panini Spectra Rising Stars Holo', null)).toBe('Spectra');
  });

  it('can boost from parsed set_name evidence', () => {
    expect(findBasketballCardProductSignal('Rookie Auto /75', null, 'Panini Flawless')).toBe('Panini Flawless');
  });

  it.each(['topplay', 'spnz', 'sports-cards-nz', 'dimecity'])(
    'enables source category boost for known card-heavy source %s',
    source => {
      const title = '2023 Panini Chronicles Kaboom SSP';
      const [row] = buildProductClassificationRows([product({ title, source })]);

      expect(row).toMatchObject({
        category: 'NBA',
        raw_signals: expect.objectContaining({
          sourceCategoryBoost: true,
          nbaSignal: 'Chronicles',
        }),
      });
    }
  );

  it('does not source-boost generic unknown sources', () => {
    const title = '2023 Panini Chronicles Kaboom SSP';
    const [row] = buildProductClassificationRows([product({ title, source: 'icons-of-sport-au' })]);

    expect(isLikelyNbaCardTitle(title, 'icons-of-sport-au')).toBe(false);
    expect(row).toMatchObject({
      category: null,
      raw_signals: expect.objectContaining({
        isLikelyCard: true,
        isLikelyNba: false,
        sourceCategoryBoost: false,
      }),
    });
  });

  it.each([
    '2020-21 Prizm Premier League Gold Wave /10',
    '2022 UFC Prizm Red /299',
    '2022 UFC Select Premier Tricolour /49',
    '2022 Select Octagon Action Signatures',
    '2023 Panini Select UFC- Rookie Octagonside Blue Disco Prizm/49',
    '2022-23 Skybox Metal Universe Hockey Base Silver FX Autograph /349',
    '2022-23 Panini Prizm Football Gold /10',
  ])('blocks explicit non-NBA sport signals: %s', title => {
    const [row] = buildProductClassificationRows([product({ title, source: 'topplay' })]);

    expect(isLikelyNbaCardTitle(title, 'topplay')).toBe(false);
    expect(row).toMatchObject({
      category: null,
      raw_signals: expect.objectContaining({
        isLikelyCard: true,
        isLikelyNba: false,
        rejectedReason: 'non_nba_sport_signal',
        sourceCategoryBoost: false,
      }),
    });
    expect(row?.raw_signals.nonNbaSportSignal).toEqual(expect.any(String));
  });

  it.each([
    'Michael Jordan Signed Chicago Bulls Rookie Jersey Framed',
    'Michael Jordan signed 1992 White Team USA Singlet Framed',
    'Michael Jordan Signed "Last Shot" Print Framed',
    'Michael Jordan Licensed Print framed',
    'LeBron James L.A. Lakers NBA Poster Framed',
    'Kobe Bryant Hall of Fame Replica Ring Framed Tribute – 5x NBA Champion Edition',
    'Jayson Tatum Boston Celtics Framed Replica 2024 Championship Ring Display',
    'Muhammed Ali & Mike Tyson Hand Signed Boxing Gloves Framed',
    'Lando Norris F1 - Rolex Australian Grand Prix Licensed Panoramic Framed',
    'Elvis Presley 30 #1 Hits Gold LP Vinyl Framed',
    '1981 XD Ford Falcon Bathurst Winning panoramic Framed',
    'Grease T-Birds Jacket Signed By John Travolta And Olivia Newton-John Framed',
    'Floyd Mayweather Signed Full-Size Robe Framed',
    'Lionel Messi Signed FC Barcelona Photo Collage Framed - BAS',
    'Taylor Swift Speak Now (Taylor’s Version) Framed LP',
  ])('keeps non-card memorabilia conservative: %s', title => {
    const [row] = buildProductClassificationRows([product({ title, externalId: title })]);

    expect(isLikelyTradingCardTitle(title)).toBe(false);
    expect(isLikelyNbaCardTitle(title)).toBe(false);
    expect(row).toMatchObject({
      category: null,
      player_name: null,
      set_name: null,
      product_line: null,
      variant_name: null,
      parallel_name: null,
      insert_name: null,
      is_rookie: false,
      is_auto: false,
      is_serial: false,
      raw_signals: expect.objectContaining({
        isLikelyCard: false,
        isLikelyNba: false,
      }),
    });
    expect(row?.raw_signals.rejectedReason).toEqual(expect.any(String));
    expect(row?.raw_signals.rejectedReason).toBe('non_card_signal');
    expect(row?.raw_signals.nonCardSignal).toEqual(expect.any(String));
  });

  it('does not treat NBA names or teams alone as NBA card inventory', () => {
    const titles = [
      'Victor Wembanyama Signed San Antonio Spurs Display',
      'Boston Celtics Championship Ring Display',
      'LeBron James Los Angeles Lakers Tribute Poster',
    ];

    for (const title of titles) {
      const [row] = buildProductClassificationRows([product({ title, externalId: title })]);
      expect(row).toMatchObject({
        category: null,
        player_name: null,
        set_name: null,
        product_line: null,
      });
    }
  });

  it('skips unavailable products during active inventory classification', () => {
    expect(buildProductClassificationRows([product({ available: false })])).toEqual([]);
  });

  it('maps store_products rows into cache inputs for backfill dry runs', () => {
    expect(
      toClassificationCacheInput({
        id: 7,
        store_id: 42,
        source: 'topplay',
        external_product_id: 'abc',
        handle: 'shohei-topps-chrome',
        title: '2024 Topps Chrome Baseball Refractor #17 Shohei Ohtani',
        current_price: 12.5,
        current_availability: true,
        product_url: null,
        canonical_url: 'https://example.com/products/shohei-topps-chrome',
        image_url: null,
        description: null,
        raw_latest_payload: { id: 'abc' },
        product_fingerprint: 'hash-abc',
      })
    ).toMatchObject({
      storeId: 42,
      source: 'topplay',
      externalId: 'abc',
      title: '2024 Topps Chrome Baseball Refractor #17 Shohei Ohtani',
      available: true,
      url: 'https://example.com/products/shohei-topps-chrome',
      contentHash: 'hash-abc',
    });
  });

  it('parses backfill dry-run options', () => {
    expect(parseBackfillArgs(['--dry-run', '--source', 'topplay', '--limit=25'])).toEqual({
      source: 'topplay',
      limit: 25,
      dryRun: true,
    });
  });

  it('uses a batched upsert keyed by store product, version, and classifier type', () => {
    const dbSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'db.ts'), 'utf8');

    expect(dbSource).toContain('insert into product_classifications');
    expect(dbSource).toContain('on conflict (store_product_id, classifier_version, classifier_type) do update');
    expect(dbSource).toContain('jsonb_to_recordset($2::jsonb)');
  });
});
