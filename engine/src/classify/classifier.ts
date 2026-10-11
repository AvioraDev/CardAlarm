import { normalizeCatalogueName } from '../catalogue/checklist-parser';
import {
  storeProvidedNames,
  titleNameSpans,
  type CatalogueCard,
  type CatalogueIndex,
  type CatalogueParallel,
  type CatalogueProduct,
  type CatalogueSubset,
} from './catalogue-index';
import { evidenceState, type ListingEvidence } from './evidence';
import { choiceAnswer, MAX_CHOICE_OPTIONS, type ChoiceAnswer, type JevClient, type JevQuestion } from './jev-client';
import { parseTitleFields, type TitleFields } from './title-fields';

export const JEV_CLASSIFIER_TYPE = 'jev';
export const JEV_CLASSIFIER_VERSION = 'jev-catalogue-v1';

const NONE = 'none_of_these';
const BASE = 'base';
const UNKNOWN = 'unknown';
const MAX_SUBSET_OPTIONS = 120;
const MAX_PARALLEL_OPTIONS = 200;

export type ItemType = 'single_card' | 'sealed_product' | 'lot' | 'memorabilia' | 'supplies' | 'other';
export type ReviewStatus = 'accepted' | 'needs_review' | 'out_of_scope';
/** Where the player came from: the catalogue, a store tag, a name span in the title, or the card number. */
export type PlayerSource = 'catalogue' | 'store' | 'title' | 'checklist' | null;
export type ParallelStatus = 'matched' | 'base' | 'unknown' | 'not_asked';

export interface ListingClassification {
  itemType: ItemType;
  itemTypeConfidence: number;
  sport: string;
  sportConfidence: number;
  fields: TitleFields;
  playerName: string | null;
  playerId: number | null;
  playerSource: PlayerSource;
  playerConfidence: number | null;
  product: CatalogueProduct | null;
  productConfidence: number | null;
  subset: CatalogueSubset | null;
  subsetConfidence: number | null;
  card: CatalogueCard | null;
  parallel: CatalogueParallel | null;
  parallelStatus: ParallelStatus;
  parallelConfidence: number | null;
  isRookie: boolean;
  isAutograph: boolean;
  isRelic: boolean;
  reviewStatus: ReviewStatus;
  reviewReasons: string[];
  /** The weakest of the decisions the result depends on. */
  confidence: number;
  jevModel: string | null;
  jevRequests: number;
  inputTokens: number;
}

export interface ClassifierOptions {
  /** Decisions below this confidence are not acted on; the listing goes to review instead. */
  minConfidence?: number;
}

const ITEM_TYPE_CRITERIA: Record<ItemType, string> = {
  single_card: 'One individual trading card, raw or graded',
  sealed_product: 'Sealed, unopened trading cards: a box, pack, blaster, case, tin or factory set',
  lot: 'Several cards sold together as a lot, bundle or team set',
  memorabilia: 'Signed or framed memorabilia such as a photo, jersey, ball, poster or print. Not a trading card',
  supplies: 'Storage or protection supplies such as sleeves, toploaders, binders or card holders',
  other: 'Anything else, including gift cards, toys, figures and merchandise',
};

const SPORT_CRITERIA: Record<string, string> = {
  basketball: 'Basketball, including the NBA, WNBA, NBL, EuroLeague, college and draft-pick basketball cards',
  american_football: 'American football: NFL or college football',
  baseball: 'Baseball: MLB',
  soccer: 'Soccer (association football): Premier League, UEFA, FIFA, MLS, La Liga',
  rugby: 'Rugby league or rugby union: NRL, All Blacks, Super Rugby',
  australian_football: 'Australian rules football: AFL',
  combat_sports: 'UFC, MMA, boxing or professional wrestling (WWE)',
  motorsport: 'Motor racing: Formula 1, NASCAR, Supercars',
  other_sport: 'Any other sport, such as hockey, cricket, golf or tennis',
  non_sport: 'Not a sport: Pokemon, Marvel, Star Wars, music or other entertainment',
  unclear: 'The listing does not make the sport clear',
};

export function jevMinConfidence(value: string | number | undefined = process.env.CARDALARM_JEV_MIN_CONFIDENCE): number {
  const parsed = value === undefined ? 0.7 : Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : 0.7;
}

/** Builds a Choice's options from catalogue entries, keeping a way back from the chosen label to the entry. */
export function buildOptions<T>(
  items: T[],
  label: (item: T) => string,
  description: (item: T) => string | null,
  reserved: Record<string, string>,
  limit: number
): { criteria: Record<string, string | null>; byLabel: Map<string, T> } {
  const criteria: Record<string, string | null> = {};
  const byLabel = new Map<string, T>();
  const reservedKeys = new Set(Object.keys(reserved));
  const room = Math.min(limit, MAX_CHOICE_OPTIONS) - reservedKeys.size;

  for (const item of items) {
    if (byLabel.size >= room) break;
    let key = label(item).replace(/\s+/g, ' ').trim();
    if (!key) continue;
    if (reservedKeys.has(key.toLowerCase())) key = `${key} (listed)`;
    if (byLabel.has(key)) continue;
    byLabel.set(key, item);
    criteria[key] = description(item);
  }

  return { criteria: { ...criteria, ...reserved }, byLabel };
}

/** Stores that shout names ("CAM CHRISTIE") get them back in ordinary capitalisation. */
function displayName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

function accepted(answer: ChoiceAnswer | null, minConfidence: number, rejectedChoices: string[]): boolean {
  return answer !== null && !rejectedChoices.includes(answer.choice) && answer.confidence >= minConfidence;
}

function subsetDescription(subset: CatalogueSubset): string {
  const kind: Record<string, string> = {
    base: 'The main numbered set, including its rookies and rookie-branded base cards such as Rated Rookies',
    insert: 'An insert subset. Choose it only when the title names this insert',
    autograph: 'An autograph subset. Choose it only when the title says autograph, auto, signature or signed',
    memorabilia: 'A memorabilia subset. Choose it only when the title says patch, relic, jersey, memorabilia or materials',
    other: 'Subset',
  };
  return kind[subset.kind] ?? 'Subset';
}

function parallelLabel(parallel: CatalogueParallel): string {
  return parallel.serialLimit ? `${parallel.name} /${parallel.serialLimit}` : parallel.name;
}

/**
 * Autograph and memorabilia subsets reuse the base set's numbers and players. When the title carries no
 * autograph or relic wording, they are ruled out in code rather than left for the model to weigh.
 */
export function subsetsConsistentWithTitle(
  subsets: CatalogueSubset[],
  fields: Pick<TitleFields, 'isAutograph' | 'isRelic'>
): CatalogueSubset[] {
  const consistent = subsets.filter(
    subset => (subset.kind !== 'autograph' || fields.isAutograph) && (subset.kind !== 'memorabilia' || fields.isRelic)
  );
  return consistent.length > 0 ? consistent : subsets;
}

/** Print runs are compared in code: a title that says /125 can only be a parallel numbered to 125. */
export function parallelsMatchingSerial(parallels: CatalogueParallel[], serialLimit: number | null): CatalogueParallel[] {
  if (serialLimit === null) return parallels;
  const numbered = parallels.filter(parallel => parallel.serialLimit === serialLimit);
  return numbered.length > 0 ? numbered : parallels;
}

export async function classifyListing(
  evidence: ListingEvidence,
  catalogue: CatalogueIndex,
  jev: JevClient,
  options: ClassifierOptions = {}
): Promise<ListingClassification> {
  const minConfidence = options.minConfidence ?? jevMinConfidence();
  const fields = parseTitleFields(evidence.title);
  const state = evidenceState(evidence);
  const searchTexts = [evidence.title, ...evidence.tags, evidence.productType ?? '', evidence.description ?? ''];

  // ── Candidates ───────────────────────────────────────────────────
  const cataloguePlayers = catalogue.findPlayers(searchTexts);
  const knownNames = new Set(cataloguePlayers.map(player => player.normalizedName));
  const storeNames = storeProvidedNames(evidence.tags, evidence.productType).filter(
    name => !knownNames.has(normalizeCatalogueName(name))
  );
  const playerCandidates = [
    ...cataloguePlayers.map(player => ({ name: player.name, playerId: player.playerId, source: 'catalogue' as const })),
    ...storeNames.map(name => ({ name, playerId: null as number | null, source: 'store' as const })),
  ];
  const productCandidates = catalogue.findProducts([evidence.title, ...evidence.tags], fields.seasonCandidates);

  // ── Request 1: what is it, who is it, which product ──────────────
  const playerOptions = buildOptions(
    playerCandidates,
    candidate => candidate.name,
    () => null,
    { [NONE]: 'The card is of a different person, or the listing names no person' },
    60
  );
  const productOptions = buildOptions(
    productCandidates,
    product => `${product.season} ${product.brand} ${product.productLine}`,
    () => null,
    { [NONE]: 'A different product, or the listing does not state the product' },
    60
  );

  const firstQuestions: Record<string, JevQuestion> = {
    item_type: {
      type: 'choice',
      instructions: 'What is this store listing selling?',
      criteria: ITEM_TYPE_CRITERIA,
    },
    sport: {
      type: 'choice',
      instructions: 'Which sport or category is this listing for?',
      criteria: SPORT_CRITERIA,
    },
  };
  if (playerOptions.byLabel.size > 0) {
    firstQuestions.player = {
      type: 'choice',
      instructions:
        'Which of these people is this trading card of? Use the name written in `title`, `tags`, `product_type` or `description`.',
      criteria: playerOptions.criteria,
    };
  }
  if (productOptions.byLabel.size > 0) {
    firstQuestions.product = {
      type: 'choice',
      instructions:
        'Which trading card product is this card from? Match both the season and the product name written in `title`. Products with similar names, such as Donruss and Donruss Optic, are different products.',
      criteria: productOptions.criteria,
    };
  }

  const first = await jev.ask(state, firstQuestions);
  let inputTokens = first.usage.input_tokens;
  let jevRequests = 1;

  const itemAnswer = choiceAnswer(first, 'item_type');
  const sportAnswer = choiceAnswer(first, 'sport');
  const playerAnswer = choiceAnswer(first, 'player');
  const productAnswer = choiceAnswer(first, 'product');

  const itemType = (itemAnswer?.choice ?? 'other') as ItemType;
  const itemTypeConfidence = itemAnswer?.confidence ?? 0;
  const sport = sportAnswer?.choice ?? 'unclear';
  const sportConfidence = sportAnswer?.confidence ?? 0;
  const reviewReasons: string[] = [];
  if (itemTypeConfidence < minConfidence) reviewReasons.push('low_confidence_item_type');
  if (sportConfidence < minConfidence) reviewReasons.push('low_confidence_sport');

  const result: ListingClassification = {
    itemType,
    itemTypeConfidence,
    sport,
    sportConfidence,
    fields,
    playerName: null,
    playerId: null,
    playerSource: null,
    playerConfidence: playerAnswer?.confidence ?? null,
    product: null,
    productConfidence: productAnswer?.confidence ?? null,
    subset: null,
    subsetConfidence: null,
    card: null,
    parallel: null,
    parallelStatus: 'not_asked',
    parallelConfidence: null,
    isRookie: fields.isRookie,
    isAutograph: fields.isAutograph,
    isRelic: fields.isRelic,
    reviewStatus: 'needs_review',
    reviewReasons,
    confidence: Math.min(itemTypeConfidence, sportConfidence),
    jevModel: first.model,
    jevRequests,
    inputTokens,
  };

  // Only basketball single cards are classified in depth; everything else is recorded and left alone.
  if (itemType !== 'single_card' || sport !== 'basketball') {
    result.reviewStatus = reviewReasons.length === 0 ? 'out_of_scope' : 'needs_review';
    return result;
  }

  if (accepted(playerAnswer, minConfidence, [NONE])) {
    const chosen = playerOptions.byLabel.get(playerAnswer!.choice)!;
    result.playerName = chosen.name;
    result.playerId = chosen.playerId;
    result.playerSource = chosen.source;
  }
  if (accepted(productAnswer, minConfidence, [NONE])) {
    result.product = productOptions.byLabel.get(productAnswer!.choice) ?? null;
  }

  // ── Fallback: a person the catalogue and the store's tags do not know ──
  // Older sets and unlicensed legends are in no checklist. Code proposes the capitalised runs in the
  // title and Jev picks the one that is exactly a person's name.
  if (!result.playerName) {
    const spanOptions = buildOptions(
      titleNameSpans(evidence.title),
      span => span,
      () => null,
      { [NONE]: 'None of these is exactly a person\'s name, or the card is not of a single person' },
      40
    );
    if (spanOptions.byLabel.size > 0) {
      const spans = await jev.ask(state, {
        player_span: {
          type: 'choice',
          instructions:
            'Which option is exactly the full name of the person this trading card is of? The right option contains the whole name and no other words.',
          criteria: spanOptions.criteria,
        },
      });
      inputTokens += spans.usage.input_tokens;
      jevRequests++;
      const spanAnswer = choiceAnswer(spans, 'player_span');
      if (accepted(spanAnswer, minConfidence, [NONE])) {
        result.playerName = displayName(spanAnswer!.choice);
        result.playerSource = 'title';
        result.playerConfidence = spanAnswer!.confidence;
      }
    }
  }

  // ── Request 2: which subset and parallel, within the chosen product ──
  if (result.product) {
    const cards = catalogue.findCards(result.product, fields.cardNumber, result.playerName);
    const subsetIds = [...new Set(cards.map(card => card.subsetId))];
    const subsetCandidates = subsetsConsistentWithTitle(
      subsetIds.map(id => catalogue.subset(id)).filter((subset): subset is CatalogueSubset => subset !== undefined),
      fields
    );

    const parallelPool = new Map<string, CatalogueParallel>();
    for (const subset of subsetCandidates) {
      for (const parallel of catalogue.parallelsFor(subset)) {
        const key = `${parallel.normalizedName}/${parallel.serialLimit ?? ''}`;
        if (!parallelPool.has(key)) parallelPool.set(key, parallel);
      }
    }
    const parallelCandidates = parallelsMatchingSerial([...parallelPool.values()], fields.serialLimit);

    const subsetOptions = buildOptions(
      subsetCandidates,
      subset => subset.name,
      subsetDescription,
      { [NONE]: 'A different subset, or the listing does not say' },
      MAX_SUBSET_OPTIONS
    );
    const parallelOptions = buildOptions(
      parallelCandidates,
      parallelLabel,
      () => null,
      {
        [BASE]: 'The standard version of the card. The title names no colour, pattern or finish',
        [UNKNOWN]: 'The title names a colour, pattern or finish that is not one of the listed options',
      },
      MAX_PARALLEL_OPTIONS
    );

    const secondQuestions: Record<string, JevQuestion> = {};
    if (subsetOptions.byLabel.size > 1) {
      secondQuestions.subset = {
        type: 'choice',
        instructions: {
          product: `${result.product.season} ${result.product.brand} ${result.product.productLine}`,
          question:
            'Which subset of `product` is this card from? Choose the base set unless `title` names an insert, autograph or memorabilia subset.',
        },
        criteria: subsetOptions.criteria,
      };
    }
    if (parallelOptions.byLabel.size > 0) {
      secondQuestions.parallel = {
        type: 'choice',
        instructions: {
          product: `${result.product.season} ${result.product.brand} ${result.product.productLine}`,
          subset_names: subsetCandidates.map(subset => subset.name),
          question:
            'Which parallel of the card does `title` describe? A parallel is a colour, pattern or finish variant, such as Silver, Blue Ice or Gold Wave. Words that are part of `product`, any of `subset_names`, the player name or the team name are not a parallel.',
        },
        criteria: parallelOptions.criteria,
      };
    }

    let subsetAnswer: ChoiceAnswer | null = null;
    let parallelAnswer: ChoiceAnswer | null = null;
    if (Object.keys(secondQuestions).length > 0) {
      const second = await jev.ask(state, secondQuestions);
      inputTokens += second.usage.input_tokens;
      jevRequests++;
      subsetAnswer = choiceAnswer(second, 'subset');
      parallelAnswer = choiceAnswer(second, 'parallel');
    }

    if (subsetCandidates.length === 1) {
      // One subset is consistent with the card number and player, so there was nothing to ask.
      result.subset = subsetCandidates[0]!;
      result.subsetConfidence = 1;
    } else if (accepted(subsetAnswer, minConfidence, [NONE])) {
      result.subset = subsetOptions.byLabel.get(subsetAnswer!.choice) ?? null;
      result.subsetConfidence = subsetAnswer!.confidence;
    } else {
      result.subsetConfidence = subsetAnswer?.confidence ?? null;
    }

    if (result.subset) {
      const inSubset = cards.filter(card => card.subsetId === result.subset!.id);
      result.card = inSubset.length === 1 ? inSubset[0]! : null;
    }

    // A card number that identifies one player in this product names the player even when the title does not.
    if (!result.playerName && fields.cardNumber) {
      const pool = result.subset ? cards.filter(card => card.subsetId === result.subset!.id) : cards;
      const names = new Set(pool.map(card => card.normalizedPlayerName));
      if (pool.length > 0 && names.size === 1) {
        result.playerName = pool[0]!.playerName;
        result.playerId = pool[0]!.playerId;
        result.playerSource = 'checklist';
        result.playerConfidence = Math.min(result.productConfidence ?? 0, result.subsetConfidence ?? 1);
      }
    }

    if (parallelAnswer) {
      result.parallelConfidence = parallelAnswer.confidence;
      if (parallelAnswer.confidence < minConfidence || parallelAnswer.choice === UNKNOWN) {
        result.parallelStatus = 'unknown';
      } else if (parallelAnswer.choice === BASE) {
        result.parallelStatus = 'base';
      } else {
        const chosen = parallelOptions.byLabel.get(parallelAnswer.choice) ?? null;
        // Prefer the chosen subset's own row for the same parallel, so the id belongs to that subset.
        const own = result.subset
          ? catalogue
              .parallelsFor(result.subset)
              .find(parallel => chosen && parallel.normalizedName === chosen.normalizedName && parallel.serialLimit === chosen.serialLimit)
          : undefined;
        result.parallel = own ?? chosen;
        result.parallelStatus = result.parallel ? 'matched' : 'unknown';
      }
    }

    if (!result.subset) reviewReasons.push('subset_unresolved');
    if (result.parallelStatus === 'unknown') reviewReasons.push('parallel_unknown');
    if (result.subset?.kind === 'autograph') result.isAutograph = true;
    if (result.subset?.kind === 'memorabilia') result.isRelic = true;
    if (result.card?.isRookie) result.isRookie = true;
  } else {
    reviewReasons.push('product_not_in_catalogue');
  }

  if (!result.playerName) reviewReasons.push('no_player');

  const core = [itemTypeConfidence, sportConfidence, result.playerName ? (result.playerConfidence ?? 0) : 0];
  result.confidence = Math.min(...core);
  result.jevRequests = jevRequests;
  result.inputTokens = inputTokens;
  // A listing is usable for watchlists once we know it is a basketball single and whose card it is.
  // Missing product, subset or parallel detail is recorded as a reason but does not block it.
  result.reviewStatus =
    result.playerName && itemTypeConfidence >= minConfidence && sportConfidence >= minConfidence ? 'accepted' : 'needs_review';
  return result;
}
