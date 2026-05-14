const NON_NBA_CATEGORY_PATTERNS: RegExp[] = [
  /\b(soccer|football|nfl|mlb|baseball|wwe|wrestling|ufc|mma|octagon|octagonside)\b/i,
  /\b(pok[eé]mon|pokemon|pikachu|marvel|spider[-\s]?man|x[-\s]?men|avengers)\b/i,
  /\b(premier\s+league|champions\s+league|la\s+liga|uefa|fifa|world\s+cup|hockey|nhl)\b/i,
];

const NBA_CONTEXT_PATTERNS: RegExp[] = [
  /\b(nba|basketball)\b/i,
  /\b(nba\s+hoops|panini\s+hoops|court\s+kings|crown\s+royale)\b/i,
  /\b(lakers|celtics|warriors|bulls|knicks|nets|heat|mavericks|suns|bucks|nuggets|cavaliers|cavs)\b/i,
  /\b(raptors|sixers|76ers|clippers|kings|pelicans|grizzlies|timberwolves|spurs|rockets|jazz)\b/i,
  /\b(thunder|trail\s+blazers|blazers|hornets|magic|pacers|pistons|hawks|wizards)\b/i,
];

const GENERIC_CARD_CONTEXT_PATTERN =
  /\b(panini|topps|prizm|select|optic|donruss|mosaic|chronicles|contenders|revolution|rookie|rc)\b/i;

function includesKnownName(title: string, names: string[]): boolean {
  const normalizedTitle = title.toLowerCase();
  return names
    .map(name => name.trim())
    .filter(name => name.length >= 3)
    .some(name => normalizedTitle.includes(name.toLowerCase()));
}

export function hasNonNbaCategorySignal(title: string): boolean {
  return NON_NBA_CATEGORY_PATTERNS.some(pattern => pattern.test(title));
}

export function hasPositiveNbaEvidence(title: string, playerNames: string[] = []): boolean {
  if (hasNonNbaCategorySignal(title)) return false;
  if (NBA_CONTEXT_PATTERNS.some(pattern => pattern.test(title))) return true;
  return includesKnownName(title, playerNames);
}

export function isGenericCardContextOnly(title: string, playerNames: string[] = []): boolean {
  return GENERIC_CARD_CONTEXT_PATTERN.test(title) && !hasPositiveNbaEvidence(title, playerNames);
}
