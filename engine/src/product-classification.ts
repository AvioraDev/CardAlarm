import { classifyTitleSignals, parseTitleMetadata } from './parse-title';
import type { SourceProductCacheInput } from './types';

export const DETERMINISTIC_CLASSIFIER_TYPE = 'deterministic';
export const DETERMINISTIC_CLASSIFIER_VERSION = 'deterministic-title-v1';

export interface ProductClassificationBatchRow {
  source: string;
  external_id: string;
  classifier_version: string;
  classifier_type: string;
  status: string;
  year: string | null;
  category: string | null;
  brand: string | null;
  product_line: string | null;
  set_name: string | null;
  card_number: string | null;
  player_name: string | null;
  team_name: string | null;
  variant_name: string | null;
  parallel_name: string | null;
  insert_name: string | null;
  is_rookie: boolean;
  is_auto: boolean;
  is_serial: boolean;
  serial_number: string | null;
  serial_current: string | null;
  serial_limit: string | null;
  confidence: number;
  raw_signals: Record<string, unknown>;
}

export interface ProductClassificationByIdRow extends ProductClassificationBatchRow {
  store_product_id: number;
}

const BRAND_PREFIXES = [
  'Upper Deck',
  'Panini',
  'Topps',
  'Bowman',
  'Donruss',
  'Mosaic',
  'Select',
  'Leaf',
  'Fleer',
  'Score',
];

function detectBrand(productLine: string | null): string | null {
  if (!productLine) return null;
  const normalized = productLine.trim();
  return BRAND_PREFIXES.find(brand => new RegExp(`^${brand}\\b`, 'i').test(normalized)) ?? null;
}

function confidenceForClassification(row: ProductClassificationBatchRow): number {
  let confidence = 0.35;
  if (row.year) confidence += 0.1;
  if (row.set_name || row.product_line) confidence += 0.15;
  if (row.card_number) confidence += 0.1;
  if (row.player_name) confidence += 0.15;
  if (row.variant_name) confidence += 0.05;
  return Math.min(confidence, 0.9);
}

export function buildProductClassificationRows(
  products: SourceProductCacheInput[]
): ProductClassificationBatchRow[] {
  return products
    .filter(product => product.available)
    .map(product => {
      const metadata = parseTitleMetadata(product.title);
      const signals = classifyTitleSignals(product.title);
      const productLine = signals.productLine ?? metadata.setName;
      const insertName = signals.caseHit ?? signals.insert;
      const variantName = signals.variant;
      const row: ProductClassificationBatchRow = {
        source: product.source,
        external_id: product.externalId,
        classifier_version: DETERMINISTIC_CLASSIFIER_VERSION,
        classifier_type: DETERMINISTIC_CLASSIFIER_TYPE,
        status: 'classified',
        year: metadata.year,
        category: metadata.category,
        brand: detectBrand(productLine),
        product_line: productLine,
        set_name: metadata.setName,
        card_number: metadata.cardNumber,
        player_name: metadata.playerName,
        team_name: null,
        variant_name: variantName,
        parallel_name: signals.parallel,
        insert_name: insertName,
        is_rookie: metadata.isRookie,
        is_auto: metadata.isAuto,
        is_serial: metadata.isSerial,
        serial_number: metadata.serialNumber,
        serial_current: metadata.serialCurrent,
        serial_limit: metadata.serialLimit,
        confidence: 0,
        raw_signals: {
          title: product.title,
          productLine: signals.productLine,
          parallel: signals.parallel,
          insert: signals.insert,
          variation: signals.variation,
          caseHit: signals.caseHit,
          shortPrint: signals.shortPrint,
          variant: signals.variant,
        },
      };

      return { ...row, confidence: confidenceForClassification(row) };
    });
}
