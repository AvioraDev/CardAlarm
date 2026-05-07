# Engine Matching Rules

## 2026-05-05: Safer Stealth Matching

### Problem
The previous Stealth Match flow allowed a listing to match a watchlist player using only `card_number`. This was unsafe because low card numbers collide across many sets. In the local database, numbers like `7`, `10`, and `24` map to dozens of distinct players. That caused listings with visible non-watchlist players to be inserted as watchlist players such as LeBron James or Damian Lillard.

### Current Rules
1. Reject obvious non-card products before Direct or Stealth matching. Examples include posters, framed photos, jerseys, shirts, boxes, packs, breaks, and cases.
2. Direct Match is allowed only after the product passes the card-context gate.
3. Stealth Match requires an extracted card number.
4. Stealth Match is rejected if the title visibly names any known checklist player. Stealth is only for listings where the seller omitted the player name.
5. Target-number overrides run after visible-player rejection. A configured target number cannot relabel a listing that visibly names another player.
6. Set-scoped checklist lookup remains the preferred high-confidence Stealth path.
7. Broad card-number fallback is allowed only when every checklist row for that number resolves to the same distinct player. Ambiguous numbers are rejected.

### Metadata Normalization
`parseTitleMetadata` now extracts `No. 24` style card numbers as well as `#24`. This keeps stored metadata consistent with `extractAll`, which already supported the `No.` format.

### Existing Data
This change prevents new polluted matches but does not mutate existing rows in `listings_feed`. Existing suspect rows should be handled by a separate cleanup pass after review, for example by identifying active `Stealth` rows where `player_name` is not present in `title` and `card_number` is ambiguous or missing.
