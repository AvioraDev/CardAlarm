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

const STRONG_NON_CARD_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bframed?\b/i, reason: 'framed memorabilia' },
  { pattern: /\bphotos?\b/i, reason: 'photo memorabilia' },
  { pattern: /\bposters?\b/i, reason: 'poster memorabilia' },
  { pattern: /\bprints?\b/i, reason: 'print memorabilia' },
  { pattern: /\bjerseys?\b/i, reason: 'jersey memorabilia' },
  { pattern: /\bsinglets?\b/i, reason: 'singlet memorabilia' },
  { pattern: /\bgloves?\b/i, reason: 'glove memorabilia' },
  { pattern: /\btrunks?\b/i, reason: 'trunks memorabilia' },
  { pattern: /\brobes?\b/i, reason: 'robe memorabilia' },
  { pattern: /\bbelts?\b/i, reason: 'belt memorabilia' },
  { pattern: /\bboots?\b/i, reason: 'boot memorabilia' },
  { pattern: /\bballs?\b/i, reason: 'ball memorabilia' },
  { pattern: /\bbats?\b/i, reason: 'bat memorabilia' },
  { pattern: /\bsurfboards?\b/i, reason: 'surfboard memorabilia' },
  { pattern: /\bvinyl\b/i, reason: 'music memorabilia' },
  { pattern: /\bLP\b/i, reason: 'music memorabilia' },
  { pattern: /\bCD\b/i, reason: 'music memorabilia' },
  { pattern: /\bjackets?\b/i, reason: 'jacket memorabilia' },
  { pattern: /\bswords?\b/i, reason: 'sword memorabilia' },
  { pattern: /\brings?\b/i, reason: 'ring memorabilia' },
  { pattern: /\bdisplays?\b/i, reason: 'display memorabilia' },
  { pattern: /\bplaques?\b/i, reason: 'plaque memorabilia' },
  { pattern: /\bpanoramic\b/i, reason: 'panoramic memorabilia' },
  { pattern: /\bcollage\b/i, reason: 'collage memorabilia' },
  { pattern: /\blicensed\s+print\b/i, reason: 'licensed print memorabilia' },
  { pattern: /\breplica\b/i, reason: 'replica memorabilia' },
  { pattern: /\bstatues?\b/i, reason: 'statue collectible' },
  { pattern: /\bfigurines?\b/i, reason: 'figurine collectible' },
  { pattern: /\btoys?\b/i, reason: 'toy collectible' },
  { pattern: /\bmodel\s+cars?\b/i, reason: 'model car collectible' },
  { pattern: /\bFord\b/i, reason: 'motorsport memorabilia' },
  { pattern: /\bFalcon\b/i, reason: 'motorsport memorabilia' },
  { pattern: /\bBathurst\b/i, reason: 'motorsport memorabilia' },
  { pattern: /\bF1\b/i, reason: 'motorsport memorabilia' },
  { pattern: /\bGrand\s+Prix\b/i, reason: 'motorsport memorabilia' },
];

const CARD_CONTEXT_PATTERN =
  /\b(Panini|Topps|Upper\s+Deck|Fleer|Skybox|Donruss|Prizm|Optic|Mosaic|Select|Hoops|Chronicles|Court\s+Kings|Contenders|Revolution|Obsidian|Origins|Flux|Recon|Certified|trading\s+card|rookie\s+card|card)\b/i;
const CARD_NUMBER_PATTERN = /(?:^|\s)(?:#|No\.?\s*)[A-Za-z0-9-]+\b/i;
const NBA_CONTEXT_PATTERN =
  /\b(NBA|basketball|Lakers|Celtics|Bulls|Warriors|Suns|Spurs|Heat|Knicks|Nets|Mavericks|Mavs|Nuggets|Bucks|Sixers|76ers|Clippers|Raptors|Grizzlies|Pelicans|Timberwolves|Wolves|Thunder|Trail\s+Blazers|Blazers|Hornets|Magic|Pacers|Pistons|Cavaliers|Cavs|Hawks|Jazz|Kings|Rockets|Wizards|LeBron\s+James|Lebron\s+James|Michael\s+Jordan|Kobe\s+Bryant|Kevin\s+Durant|Victor\s+Wembanyama|Jayson\s+Tatum|Stephen\s+Curry|Luka\s+Doncic|Giannis\s+Antetokounmpo|Nikola\s+Jokic|Shaquille\s+O'Neal)\b/i;
const NBA_CARD_PRODUCT_PATTERNS: Array<{ pattern: RegExp; signal: string }> = [
  { pattern: /\bPanini\s+Flawless\b/i, signal: 'Panini Flawless' },
  { pattern: /\bFlawless\b/i, signal: 'Flawless' },
  { pattern: /\bPanini\s+One\s+And\s+One\b/i, signal: 'Panini One And One' },
  { pattern: /\bOne\s+And\s+One\b/i, signal: 'One And One' },
  { pattern: /\bPanini\s+Noir\b/i, signal: 'Panini Noir' },
  { pattern: /\bNoir\b/i, signal: 'Noir' },
  { pattern: /\bPanini\s+Impeccable\b/i, signal: 'Panini Impeccable' },
  { pattern: /\bImpeccable\b/i, signal: 'Impeccable' },
  { pattern: /\bPanini\s+Phoenix\b/i, signal: 'Panini Phoenix' },
  { pattern: /\bPhoenix\b/i, signal: 'Phoenix' },
  { pattern: /\bPanini\s+Photogenic\b/i, signal: 'Panini Photogenic' },
  { pattern: /\bPhotogenic\b/i, signal: 'Photogenic' },
  { pattern: /\bPanini\s+Crown\s+Royale\b/i, signal: 'Panini Crown Royale' },
  { pattern: /\bCrown\s+Royale\b/i, signal: 'Crown Royale' },
  { pattern: /\bPanini\s+Encased\b/i, signal: 'Panini Encased' },
  { pattern: /\bEncased\b/i, signal: 'Encased' },
  { pattern: /\bPanini\s+Preferred\b/i, signal: 'Panini Preferred' },
  { pattern: /\bPreferred\b/i, signal: 'Preferred' },
  { pattern: /\bPanini\s+Prestige\b/i, signal: 'Panini Prestige' },
  { pattern: /\bPrestige\b/i, signal: 'Prestige' },
  { pattern: /\bPanini\s+Complete\b/i, signal: 'Panini Complete' },
  { pattern: /\bComplete\b/i, signal: 'Complete' },
  { pattern: /\bPanini\s+Instant\b/i, signal: 'Panini Instant' },
  { pattern: /\bInstant\b/i, signal: 'Instant' },
  { pattern: /\bPanini\s+Luxe\b/i, signal: 'Panini Luxe' },
  { pattern: /\bLuxe\b/i, signal: 'Luxe' },
  { pattern: /\bPanini\s+Absolute\b/i, signal: 'Panini Absolute' },
  { pattern: /\bAbsolute\b/i, signal: 'Absolute' },
  { pattern: /\bPanini\s+Black\b/i, signal: 'Panini Black' },
  { pattern: /\bPanini\s+Prizm\b/i, signal: 'Panini Prizm' },
  { pattern: /\bPanini\s+Donruss\b/i, signal: 'Panini Donruss' },
  { pattern: /\bDonruss\s+Elite\b/i, signal: 'Donruss Elite' },
  { pattern: /\bPrizm\b/i, signal: 'Prizm' },
  { pattern: /\bDonruss\s+Optic\b/i, signal: 'Donruss Optic' },
  { pattern: /\bDonruss\b/i, signal: 'Donruss' },
  { pattern: /\bOptic\b/i, signal: 'Optic' },
  { pattern: /\bNBA\s+Hoops\b/i, signal: 'NBA Hoops' },
  { pattern: /\bHoops\b/i, signal: 'Hoops' },
  { pattern: /\bMosaic\b/i, signal: 'Mosaic' },
  { pattern: /\bSelect\b/i, signal: 'Select' },
  { pattern: /\bChronicles\b/i, signal: 'Chronicles' },
  { pattern: /\bContenders\b/i, signal: 'Contenders' },
  { pattern: /\bRevolution\b/i, signal: 'Revolution' },
  { pattern: /\bObsidian\b/i, signal: 'Obsidian' },
  { pattern: /\bOrigins\b/i, signal: 'Origins' },
  { pattern: /\bFlux\b/i, signal: 'Flux' },
  { pattern: /\bSpectra\b/i, signal: 'Spectra' },
  { pattern: /\bCertified\b/i, signal: 'Certified' },
  { pattern: /\bCourt\s+Kings\b/i, signal: 'Court Kings' },
  { pattern: /\bRecon\b/i, signal: 'Recon' },
  { pattern: /\bNational\s+Treasures\b/i, signal: 'National Treasures' },
  { pattern: /\bKaboom\b/i, signal: 'Kaboom' },
  { pattern: /\bColor\s*blast\b/i, signal: 'Color Blast' },
  { pattern: /\bRated\s+Rookie\b/i, signal: 'Rated Rookie' },
  { pattern: /\bRookie\s+Card\b/i, signal: 'Rookie Card' },
  { pattern: /\bRookie\s+Ticket\b/i, signal: 'Rookie Ticket' },
  { pattern: /\bRookie\s+Ink\b/i, signal: 'Rookie Ink' },
  { pattern: /\bRookie\s+Roll\s+Call\b/i, signal: 'Rookie Roll Call' },
  { pattern: /\bFreshman\s+Fabric\b/i, signal: 'Freshman Fabric' },
  { pattern: /\bGame\s+Ticket\b/i, signal: 'Game Ticket' },
  { pattern: /\bPanini\b/i, signal: 'Panini' },
];
const NON_NBA_SPORT_PATTERNS: Array<{ pattern: RegExp; signal: string }> = [
  { pattern: /\bUFC\b/i, signal: 'UFC' },
  { pattern: /\bMMA\b/i, signal: 'MMA' },
  { pattern: /\bOctagon\b/i, signal: 'Octagon' },
  { pattern: /\bOctagonside\b/i, signal: 'Octagonside' },
  { pattern: /\bPremier\s+League\b/i, signal: 'Premier League' },
  { pattern: /\bWorld\s+Cup\b/i, signal: 'World Cup' },
  { pattern: /\bQatar\b/i, signal: 'Qatar' },
  { pattern: /\bSoccer\b/i, signal: 'Soccer' },
  { pattern: /\bFootball\b/i, signal: 'Football' },
  { pattern: /\bNFL\b/i, signal: 'NFL' },
  { pattern: /\bBaseball\b/i, signal: 'Baseball' },
  { pattern: /\bMLB\b/i, signal: 'MLB' },
  { pattern: /\bHockey\b/i, signal: 'Hockey' },
  { pattern: /\bNHL\b/i, signal: 'NHL' },
  { pattern: /\bF1\b/i, signal: 'F1' },
  { pattern: /\bFormula\s+1\b/i, signal: 'Formula 1' },
  { pattern: /\bWWE\b/i, signal: 'WWE' },
  { pattern: /\bPok[eé]mon\b/i, signal: 'Pokémon' },
];
const CARD_HEAVY_SOURCE_SLUGS = new Set(['topplay', 'spnz', 'sports-cards-nz', 'dimecity']);

function detectBrand(productLine: string | null): string | null {
  if (!productLine) return null;
  const normalized = productLine.trim();
  return BRAND_PREFIXES.find(brand => new RegExp(`^${brand}\\b`, 'i').test(normalized)) ?? null;
}

function rejectedNonCardReason(title: string): string | null {
  return STRONG_NON_CARD_PATTERNS.find(({ pattern }) => pattern.test(title))?.reason ?? null;
}

function classificationEvidence(title: string, productLine: string | null, setName: string | null): string {
  return [title, productLine, setName].filter(Boolean).join(' ');
}

export function findBasketballCardProductSignal(
  title: string,
  productLine: string | null = null,
  setName: string | null = null
): string | null {
  const evidence = classificationEvidence(title, productLine, setName);
  return NBA_CARD_PRODUCT_PATTERNS.find(({ pattern }) => pattern.test(evidence))?.signal ?? null;
}

function findNbaSignal(title: string, productLine: string | null, setName: string | null): string | null {
  const evidence = classificationEvidence(title, productLine, setName);
  return NBA_CONTEXT_PATTERN.test(evidence)
    ? 'NBA context'
    : findBasketballCardProductSignal(title, productLine, setName);
}

function findSourceBoostNbaSignal(title: string, productLine: string | null, setName: string | null): string | null {
  return findBasketballCardProductSignal(title, productLine, setName);
}

function findNonNbaSportSignal(title: string): string | null {
  return NON_NBA_SPORT_PATTERNS.find(({ pattern }) => pattern.test(title))?.signal ?? null;
}

function isKnownCardHeavySource(source: string): boolean {
  return CARD_HEAVY_SOURCE_SLUGS.has(source.trim().toLowerCase());
}

export function isLikelyTradingCardTitle(title: string): boolean {
  if (rejectedNonCardReason(title)) return false;
  return CARD_CONTEXT_PATTERN.test(title) || (CARD_NUMBER_PATTERN.test(title) && CARD_CONTEXT_PATTERN.test(title));
}

export function isLikelyNbaCardTitle(
  title: string,
  source = '',
  productLine: string | null = null,
  setName: string | null = null
): boolean {
  if (!isLikelyTradingCardTitle(title)) return false;
  if (findNonNbaSportSignal(title)) return false;
  if (NBA_CONTEXT_PATTERN.test(classificationEvidence(title, productLine, setName))) return true;
  return isKnownCardHeavySource(source) && Boolean(findSourceBoostNbaSignal(title, productLine, setName));
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
      const isLikelyCard = isLikelyTradingCardTitle(product.title);
      const productLine = isLikelyCard ? signals.productLine ?? metadata.setName : null;
      const setName = isLikelyCard ? metadata.setName : null;
      const nonCardSignal = rejectedNonCardReason(product.title);
      const nonNbaSportSignal = findNonNbaSportSignal(product.title);
      const nbaSignal = findNbaSignal(product.title, productLine, setName);
      const sourceCategoryBoost =
        isLikelyCard &&
        isKnownCardHeavySource(product.source) &&
        !nonCardSignal &&
        !nonNbaSportSignal &&
        !NBA_CONTEXT_PATTERN.test(classificationEvidence(product.title, productLine, setName)) &&
        Boolean(findSourceBoostNbaSignal(product.title, productLine, setName));
      const isLikelyNba = isLikelyNbaCardTitle(product.title, product.source, productLine, setName);
      const rejectedReason = nonCardSignal
        ? 'non_card_signal'
        : nonNbaSportSignal
          ? 'non_nba_sport_signal'
          : null;
      const insertName = isLikelyCard ? signals.caseHit ?? signals.insert : null;
      const variantName = isLikelyCard ? signals.variant : null;
      const row: ProductClassificationBatchRow = {
        source: product.source,
        external_id: product.externalId,
        classifier_version: DETERMINISTIC_CLASSIFIER_VERSION,
        classifier_type: DETERMINISTIC_CLASSIFIER_TYPE,
        status: 'classified',
        year: isLikelyCard ? metadata.year : null,
        category: isLikelyNba ? 'NBA' : null,
        brand: detectBrand(productLine),
        product_line: productLine,
        set_name: setName,
        card_number: isLikelyCard ? metadata.cardNumber : null,
        player_name: isLikelyCard ? metadata.playerName : null,
        team_name: null,
        variant_name: variantName,
        parallel_name: isLikelyCard ? signals.parallel : null,
        insert_name: insertName,
        is_rookie: isLikelyCard ? metadata.isRookie : false,
        is_auto: isLikelyCard ? metadata.isAuto : false,
        is_serial: isLikelyCard ? metadata.isSerial : false,
        serial_number: isLikelyCard ? metadata.serialNumber : null,
        serial_current: isLikelyCard ? metadata.serialCurrent : null,
        serial_limit: isLikelyCard ? metadata.serialLimit : null,
        confidence: 0,
        raw_signals: {
          title: product.title,
          isLikelyCard,
          isLikelyNba,
          rejectedReason,
          nbaSignal,
          nonNbaSportSignal,
          nonCardSignal,
          sourceCategoryBoost,
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
