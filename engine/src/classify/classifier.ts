import { normalizeCatalogueName } from '../catalogue/checklist-parser';
import {
  adjacentSeasons,
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
/**
 * v2 (CAR-78, decisions D-005 and D-006): rules generate candidates and decide acceptance; Jev only
 * chooses among the candidates rules allow. A match must map to a catalogue row.
 */
export const JEV_CLASSIFIER_VERSION = 'jev-catalogue-v3';

const NONE = 'none_of_these';
const BASE = 'base';
const UNKNOWN = 'unknown';
const MAX_SUBSET_OPTIONS = 120;
const MAX_PARALLEL_OPTIONS = 200;
/** A Possible match never reports more confidence than this, whatever the model said. */
const POSSIBLE_CONFIDENCE_CAP = 0.74;

export type ItemType = 'single_card' | 'sealed_product' | 'lot' | 'memorabilia' | 'supplies' | 'other';
/**
 * accepted     - maps to a catalogue row and the card number and player agree with it (shown as a match)
 * possible     - product and player are in the catalogue but the row is not confirmed: no card number, subset
 *                unresolved, or the season was widened by one (shown separately)
 * unmatched    - no catalogue row; the listing may still be shown to the player's watchlist by D-005, with
 *                only what the store provides
 * out_of_scope - positive evidence that it is not a basketball card
 * needs_review - legacy value from classifier v1; v2 never produces it
 */
export type ReviewStatus = 'accepted' | 'possible' | 'unmatched' | 'out_of_scope' | 'needs_review';
/** Where the player came from: the catalogue, a store tag, a name span in the title, or the card number. */
export type PlayerSource = 'catalogue' | 'store' | 'title' | 'checklist' | null;
export type ParallelStatus = 'matched' | 'base' | 'unknown' | 'not_asked';

/** What the model said about item type and sport. A hint: it can never accept a match (D-006). */
export interface ClassificationHints {
  itemType: ItemType;
  itemTypeConfidence: number;
  sport: string;
  sportConfidence: number;
}

export interface ListingClassification {
  /** From the matched catalogue row when there is one (single_card), otherwise the model's hint. */
  itemType: ItemType;
  itemTypeConfidence: number;
  /** From the matched catalogue row when there is one (basketball), otherwise the model's hint. */
  sport: string;
  sportConfidence: number;
  /** True when itemType and sport come from a matched catalogue row rather than from the model. */
  grounded: boolean;
  hints: ClassificationHints;
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
  /** From the matched row's subset kind. Null means unknown: it is never "yes" without a matched row. */
  isAutograph: boolean | null;
  isRelic: boolean | null;
  reviewStatus: ReviewStatus;
  reviewReasons: string[];
  /** Catalogue-confirmed fields, for example ["product", "card_number", "player", "subset"]. */
  matchedFields: string[];
  /** Plain statements of why the result is what it is. */
  matchReasons: string[];
  matcherVersion: string;
  /** Set when the title's season had to be widened by one to find the card, for example "2020-21 -> 2021-22". */
  yearWidened: string | null;
  /** The weakest of the model-decided steps the result depends on; 1 when rules decided everything. */
  confidence: number;
  jevModel: string | null;
  jevRequests: number;
  inputTokens: number;
}

export interface ClassifierOptions {
  /** Decisions below this confidence are not acted on. */
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
 * autograph or relic wording, they are ruled out in code rather than left for the model to weigh. This only
 * narrows the candidates; whether a card is an autograph is read from the matched row, never from the title.
 */
export function subsetsConsistentWithTitle(
  subsets: CatalogueSubset[],
  fields: Pick<TitleFields, 'isAutograph' | 'isRelic'>,
  title?: string
): CatalogueSubset[] {
  const consistent = subsets.filter(
    subset => (subset.kind !== 'autograph' || fields.isAutograph) && (subset.kind !== 'memorabilia' || fields.isRelic)
  );
  const candidates = consistent.length > 0 ? consistent : subsets;
  // When the title names exactly one of the candidate subsets, that one is chosen ("Season Ticket" -> "Base Season Ticket").
  if (title && candidates.length > 1) {
    const named = candidates.filter(subset => titleNamesSubset(title, subset.name));
    if (named.length === 1) return named;
  }
  return candidates;
}

const GENERIC_SUBSET_WORDS = new Set(['base', 'set']);

/** The title contains the subset's distinctive name as a whole phrase ("Base Set" alone names nothing). */
export function titleNamesSubset(title: string, subsetName: string): boolean {
  const phrase = normalizeCatalogueName(subsetName)
    .split(' ')
    .filter(token => token && !GENERIC_SUBSET_WORDS.has(token))
    .join(' ');
  return phrase !== '' && ` ${normalizeCatalogueName(title)} `.includes(` ${phrase} `);
}

/** Print runs are compared in code: a title that says /125 can only be a parallel numbered to 125. */
export function parallelsMatchingSerial(parallels: CatalogueParallel[], serialLimit: number | null): CatalogueParallel[] {
  if (serialLimit === null) return parallels;
  const numbered = parallels.filter(parallel => parallel.serialLimit === serialLimit);
  return numbered.length > 0 ? numbered : parallels;
}

function isPositivelyNotBasketballCard(hints: ClassificationHints, minConfidence: number): boolean {
  const notSingle = hints.itemTypeConfidence >= minConfidence && hints.itemType !== 'single_card';
  const otherSport =
    hints.sportConfidence >= minConfidence && hints.sport !== 'basketball' && hints.sport !== 'unclear';
  return notSingle || otherSport;
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
  const reasons: string[] = [];
  const matchReasons: string[] = [];

  // ── Candidates (rules) ───────────────────────────────────────────
  const cataloguePlayers = catalogue.findPlayers(searchTexts);
  const exactPlayers = catalogue.findExactPlayers(evidence.title);
  // A known NBA player written in the title, a tag or the product type. While one is named, a model hint for
  // another sport cannot rule the listing out: the model said "soccer" for a basketball card once already.
  const namedNbaPlayer = [evidence.title, ...evidence.tags, evidence.productType ?? ''].some(
    text => catalogue.findExactPlayers(text).length > 0
  );
  const knownNames = new Set(cataloguePlayers.map(player => player.normalizedName));
  const storeNames = storeProvidedNames(evidence.tags, evidence.productType).filter(
    name => !knownNames.has(normalizeCatalogueName(name))
  );
  const playerCandidates = [
    ...cataloguePlayers.map(player => ({ name: player.name, playerId: player.playerId, source: 'catalogue' as const })),
    ...storeNames.map(name => ({ name, playerId: null as number | null, source: 'store' as const })),
  ];
  const productCandidates = catalogue.findProducts([evidence.title, ...evidence.tags], fields.seasonCandidates);

  // One exact candidate needs no tiebreak, so rules accept it. The model only arbitrates between several.
  const ruleProduct = productCandidates.length === 1 ? productCandidates[0]! : null;
  const rulePlayer = exactPlayers.length === 1 ? exactPlayers[0]! : null;

  // ── Request 1: hints, plus a choice wherever rules left more than one candidate ──
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
  if (!rulePlayer && playerOptions.byLabel.size > 0) {
    firstQuestions.player = {
      type: 'choice',
      instructions:
        'Which of these people is this trading card of? Use the name written in `title`, `tags`, `product_type` or `description`.',
      criteria: playerOptions.criteria,
    };
  }
  if (productCandidates.length > 1) {
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

  const hints: ClassificationHints = {
    itemType: (itemAnswer?.choice ?? 'other') as ItemType,
    itemTypeConfidence: itemAnswer?.confidence ?? 0,
    sport: sportAnswer?.choice ?? 'unclear',
    sportConfidence: sportAnswer?.confidence ?? 0,
  };

  // Components the model decided, so the result can report its weakest link.
  const modelScores: number[] = [];

  // ── Player ───────────────────────────────────────────────────────
  let playerName: string | null = null;
  let playerId: number | null = null;
  let playerSource: PlayerSource = null;
  let playerConfidence: number | null = null;
  if (rulePlayer) {
    playerName = rulePlayer.name;
    playerId = rulePlayer.playerId;
    playerSource = 'catalogue';
    playerConfidence = 1;
    matchReasons.push(`Player "${rulePlayer.name}" is written in the title and is the only catalogue player named`);
  } else if (accepted(playerAnswer, minConfidence, [NONE])) {
    const chosen = playerOptions.byLabel.get(playerAnswer!.choice)!;
    playerName = chosen.name;
    playerId = chosen.playerId;
    playerSource = chosen.source;
    playerConfidence = playerAnswer!.confidence;
    modelScores.push(playerAnswer!.confidence);
    matchReasons.push(`Player "${chosen.name}" chosen by the model among ${playerOptions.byLabel.size} candidates (${playerAnswer!.confidence})`);
  } else if (playerAnswer) {
    playerConfidence = playerAnswer.confidence;
  }

  // ── Product ──────────────────────────────────────────────────────
  let product: CatalogueProduct | null = null;
  let productConfidence: number | null = null;
  if (ruleProduct) {
    product = ruleProduct;
    productConfidence = 1;
    matchReasons.push(`Product ${ruleProduct.season} ${ruleProduct.brand} ${ruleProduct.productLine} is the only catalogue product matching the title and season`);
  } else if (productCandidates.length > 1) {
    productConfidence = productAnswer?.confidence ?? null;
    if (accepted(productAnswer, minConfidence, [NONE])) {
      product = productOptions.byLabel.get(productAnswer!.choice) ?? null;
      if (product) {
        modelScores.push(productAnswer!.confidence);
        matchReasons.push(`Product ${product.season} ${product.productLine} chosen by the model among ${productCandidates.length} candidates (${productAnswer!.confidence})`);
      }
    }
    if (!product) reasons.push('product_candidate_rejected');
  } else {
    reasons.push('product_not_in_catalogue');
  }

  // ── Fallback names: only for showing the listing under a player (D-005); they can never accept a match ──
  if (!playerName) {
    const spanOptions = buildOptions(
      titleNameSpans(evidence.title),
      span => span,
      () => null,
      { [NONE]: 'None of these is exactly a person\'s name, or the card is not of a single person' },
      40
    );
    if (spanOptions.byLabel.size > 0 && !isPositivelyNotBasketballCard(hints, minConfidence)) {
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
        playerName = displayName(spanAnswer!.choice);
        playerSource = 'title';
        playerConfidence = spanAnswer!.confidence;
      }
    }
  }

  const base = {
    fields,
    hints,
    playerId,
    jevModel: first.model,
    matcherVersion: JEV_CLASSIFIER_VERSION,
  };
  const empty = (status: ReviewStatus): ListingClassification => ({
    ...base,
    itemType: hints.itemType,
    itemTypeConfidence: hints.itemTypeConfidence,
    sport: hints.sport,
    sportConfidence: hints.sportConfidence,
    grounded: false,
    playerName,
    playerSource,
    playerConfidence,
    product: null,
    productConfidence,
    subset: null,
    subsetConfidence: null,
    card: null,
    parallel: null,
    parallelStatus: 'not_asked',
    parallelConfidence: null,
    isRookie: fields.isRookie,
    isAutograph: null,
    isRelic: null,
    reviewStatus: status,
    reviewReasons: reasons,
    matchedFields: [],
    matchReasons,
    yearWidened: null,
    confidence: 0,
    jevRequests,
    inputTokens,
  });

  // Nothing to match against: no product, no player, or a product that does not contain the player.
  const unmatched = (): ListingClassification =>
    empty(isPositivelyNotBasketballCard(hints, minConfidence) && !namedNbaPlayer ? 'out_of_scope' : 'unmatched');

  if (!product) {
    if (!playerName) reasons.push('no_player');
    return unmatched();
  }

  // A player derived from the card number is a derived value, not a stated one (it caps at Possible).
  let derivedPlayerFromNumber = false;
  if (!playerName && fields.cardNumber) {
    const pool = catalogue.cardsWithNumber(product, fields.cardNumber);
    const names = new Set(pool.map(card => card.normalizedPlayerName));
    if (pool.length > 0 && names.size === 1) {
      playerName = pool[0]!.playerName;
      playerId = pool[0]!.playerId;
      playerSource = 'checklist';
      playerConfidence = productConfidence;
      derivedPlayerFromNumber = true;
      matchReasons.push(`Player "${playerName}" derived from card number #${fields.cardNumber} in the catalogue; the title names nobody`);
    }
  }
  if (!playerName) {
    reasons.push('no_player');
    return unmatched();
  }
  base.playerId = playerId;

  // ── Catalogue rows: card number AND player must agree with a row ──
  const number = fields.cardNumber;
  let agreeing: CatalogueCard[] = number ? catalogue.findAgreeingCards(product, number, playerName) : [];
  let yearWidened: string | null = null;

  if (number && agreeing.length === 0) {
    // A seller's year can be a season off. Look one season either side, same product line, and say so.
    for (const season of adjacentSeasons(product.season)) {
      const sibling = catalogue
        .findProducts([evidence.title, ...evidence.tags], [season])
        .find(candidate => candidate.productLine === product!.productLine);
      const found = sibling ? catalogue.findAgreeingCards(sibling, number, playerName) : [];
      if (sibling && found.length > 0) {
        yearWidened = `${product.season} -> ${sibling.season}`;
        product = sibling;
        agreeing = found;
        matchReasons.push(`Year widened ${yearWidened}: the card is not in the stated season`);
        break;
      }
    }
  }

  const playerRows = catalogue.playerCards(product, playerName);
  if (agreeing.length === 0 && number) {
    const numberRows = catalogue.cardsWithNumber(product, number);
    if (playerRows.length > 0 || numberRows.length > 0) {
      // The number belongs to someone else, or the player has no such number, in the product the title names.
      // A guess about the product here would be a bad match, so none is stored (the listing is shown only as
      // the store describes it, under the player).
      reasons.push('card_number_conflict');
      // The kind of conflict, so the remaining ones can be counted by type.
      if (numberRows.length === 0 && /[A-Za-z]/.test(number)) reasons.push('conflict:code_not_in_checklist');
      else if (numberRows.length === 0) reasons.push('conflict:number_not_in_product');
      else if (playerRows.length === 0) reasons.push('conflict:player_has_no_card_in_product');
      else reasons.push('conflict:number_belongs_to_another_player');
      matchReasons.splice(0, matchReasons.length, `Card #${number} is not a ${playerName} card in the products the title names; no product is recorded`);
      return unmatched();
    }
  }
  if (agreeing.length === 0 && playerRows.length === 0) {
    reasons.push('player_not_in_product');
    return unmatched();
  }

  // ── Request 2: subset and parallel, within the rows that agree ──
  let subset: CatalogueSubset | null = null;
  let subsetConfidence: number | null = null;
  let card: CatalogueCard | null = null;
  let parallel: CatalogueParallel | null = null;
  let parallelStatus: ParallelStatus = 'not_asked';
  let parallelConfidence: number | null = null;

  if (agreeing.length > 0) {
    const subsetIds = [...new Set(agreeing.map(row => row.subsetId))];
    const subsetCandidates = subsetsConsistentWithTitle(
      subsetIds.map(id => catalogue.subset(id)).filter((candidate): candidate is CatalogueSubset => candidate !== undefined),
      fields,
      evidence.title
    );

    const parallelPool = new Map<string, CatalogueParallel>();
    for (const candidate of subsetCandidates) {
      for (const option of catalogue.parallelsFor(candidate)) {
        const key = `${option.normalizedName}/${option.serialLimit ?? ''}`;
        if (!parallelPool.has(key)) parallelPool.set(key, option);
      }
    }
    const parallelCandidates = parallelsMatchingSerial([...parallelPool.values()], fields.serialLimit);

    const subsetOptions = buildOptions(
      subsetCandidates,
      candidate => candidate.name,
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

    const productLabel = `${product.season} ${product.brand} ${product.productLine}`;
    const secondQuestions: Record<string, JevQuestion> = {};
    if (subsetOptions.byLabel.size > 1) {
      secondQuestions.subset = {
        type: 'choice',
        instructions: {
          product: productLabel,
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
          product: productLabel,
          subset_names: subsetCandidates.map(candidate => candidate.name),
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
      subset = subsetCandidates[0]!;
      subsetConfidence = 1;
      matchReasons.push(`Subset "${subset.name}" is the only one holding card #${number} for ${playerName}`);
    } else if (accepted(subsetAnswer, minConfidence, [NONE])) {
      subset = subsetOptions.byLabel.get(subsetAnswer!.choice) ?? null;
      subsetConfidence = subsetAnswer!.confidence;
      if (subset) {
        modelScores.push(subsetAnswer!.confidence);
        matchReasons.push(`Subset "${subset.name}" chosen by the model among ${subsetCandidates.length} candidates holding the same number and player (${subsetAnswer!.confidence})`);
      }
    } else {
      subsetConfidence = subsetAnswer?.confidence ?? null;
    }

    if (subset) {
      const inSubset = agreeing.filter(row => row.subsetId === subset!.id);
      card = inSubset[0] ?? null;
    } else {
      reasons.push('subset_unresolved');
    }

    if (parallelAnswer) {
      parallelConfidence = parallelAnswer.confidence;
      if (parallelAnswer.confidence < minConfidence || parallelAnswer.choice === UNKNOWN) {
        parallelStatus = 'unknown';
      } else if (parallelAnswer.choice === BASE) {
        parallelStatus = 'base';
      } else {
        const chosen = parallelOptions.byLabel.get(parallelAnswer.choice) ?? null;
        // Prefer the chosen subset's own row for the same parallel, so the id belongs to that subset.
        const own = subset
          ? catalogue
              .parallelsFor(subset)
              .find(candidate => chosen && candidate.normalizedName === chosen.normalizedName && candidate.serialLimit === chosen.serialLimit)
          : undefined;
        parallel = own ?? chosen;
        parallelStatus = parallel ? 'matched' : 'unknown';
        if (parallel) modelScores.push(parallelAnswer.confidence);
      }
    }
    if (parallelStatus === 'unknown') reasons.push('parallel_unknown');
  } else {
    reasons.push('no_card_number');
  }

  // ── Outcome ──────────────────────────────────────────────────────
  const matchedFields = ['product', 'player'];
  if (card) matchedFields.push('card_number');
  if (subset) matchedFields.push('subset');
  if (parallel) matchedFields.push('parallel');
  if (fields.serialLimit !== null && parallel?.serialLimit === fields.serialLimit) matchedFields.push('serial_limit');

  if (card) {
    matchReasons.push(`Card #${card.cardNumber} and player "${card.playerName}" agree with a catalogue row in "${subset!.name}"`);
  }
  // Without a matched row nothing in the catalogue says this is a single card, so a model that is sure it
  // is a box, a supply or another sport rules a Possible out.
  if (!card && isPositivelyNotBasketballCard(hints, minConfidence)) return unmatched();

  const confirmed = card !== null && !yearWidened && !derivedPlayerFromNumber;
  if (yearWidened) reasons.push('year_widened');
  if (derivedPlayerFromNumber) reasons.push('player_derived_from_card_number');
  const status: ReviewStatus = confirmed ? 'accepted' : 'possible';

  const weakest = modelScores.length > 0 ? Math.min(...modelScores) : 1;
  const confidence = status === 'accepted' ? weakest : Math.min(weakest, POSSIBLE_CONFIDENCE_CAP);

  return {
    ...base,
    // Item type and sport come from a matched catalogue row, not from the model's hints (D-006). Without a
    // matched card the hints are kept as hints.
    itemType: card ? 'single_card' : hints.itemType,
    itemTypeConfidence: card ? 1 : hints.itemTypeConfidence,
    sport: card ? 'basketball' : hints.sport,
    sportConfidence: card ? 1 : hints.sportConfidence,
    grounded: card !== null,
    playerName,
    playerSource,
    playerConfidence,
    product,
    productConfidence,
    subset,
    subsetConfidence,
    card,
    parallel,
    parallelStatus,
    parallelConfidence,
    isRookie: fields.isRookie || Boolean(card?.isRookie),
    // Read from the matched row. With no matched subset the answer is unknown, not "no".
    isAutograph: subset ? subset.kind === 'autograph' : null,
    isRelic: subset ? subset.kind === 'memorabilia' : null,
    reviewStatus: status,
    reviewReasons: reasons,
    matchedFields,
    matchReasons,
    yearWidened,
    confidence,
    jevRequests,
    inputTokens,
  };
}
