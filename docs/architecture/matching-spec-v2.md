# Matcher error analysis and matching spec (v2 draft)

Status: **design only, pending founder approval.** No matcher code has been changed.
Date: 2026-10-12. Evidence base: the 20 listings, the code on `main` (`affe796`), the live catalogue and classification tables, and `docs/ai/cardalarm-master-context.md`, `docs/architecture/*`, `docs/CardAlarm_MVP_PROMPT_ROADMAP.md`.

Fixtures: `engine/__tests__/fixtures/matcher-fixtures.json` (20 listings, expected outcomes, catalogue verification per fixture).

## 1. Summary

1. The 20 failures come from four different places, not one matcher being weak: **catalogue coverage** (8 of 20 listings are for products that are not in the catalogue at all), **untrusted vendor fields** (title, description, slug, tags and `product_type` all disagree with each other), **acceptance rules that do not require catalogue grounding**, and **keyword rules standing in for the checklist** (insert vs parallel, autograph, sealed).
2. The single biggest lever is not a smarter matcher: it is **catalogue coverage**. Of 10,786 active basketball singles, **6,443 (60%) resolve to no catalogue product**. 2,638 are pre-2010 and 984 are 2010 to 2018; the catalogue starts at 2019-20.
3. Several expectations in the brief do not hold against the real catalogue (section 3). The spec follows the catalogue (Principle 1), and the fixtures record every place they differ.
4. The master context says matching must be "rules-first and explainable" and "not a black-box AI matcher" (section 11 of that document). Jev is an external model that chooses among options we supply. That is closer to a closed-set chooser than a black box, but it is a live conflict with the document and needs a Decision (D-006 below).

Fixture outcomes against today's catalogue: **10 confirmed, 2 possible, 8 unmatched (catalogue gap)**. The brief expected most of the 20 to be Confirmed once catalogued.

## 2. Root-cause analysis

Each cause from the brief is checked against the code and data. "Confirmed" means I found it in the code or the stored rows.

| # | Cause in the brief | Verdict | Evidence |
|---|---|---|---|
| 1 | Vendor data is untrusted at every field | **Confirmed, and wider than listed.** Store `tags` and `product_type` are also untrusted. | #3: spnz's `product_type` is "NBA Sports Card" on every spnz single, including the Bowman card, and tags are copied from the duplicated Iverson listing. Jev answered sport=basketball at 1.0 from them. #209: tag "Bub Carrrington" is misspelled. |
| 2 | Insert vs parallel cannot be inferred from keywords | **Confirmed.** | `parse-title.ts` / `product-classification.ts` pick parallel and insert from keyword lists (Standard). Jev already gets this right when the product is found, because it chooses from the checklist's subset and parallel lists (#6, #8, #18). |
| 3 | Tokeniser truncates multi-word names and leaks set terms into the player | **Confirmed.** | 197 of 199 Standard player names contain the right name but are padded with trailing words ("Dylan Harper Rookie Card Purple Chrome Refractor 038"); "Shock Wave" became "Wave"; "Season Ticket" ended up in the player (#16). |
| 4 | Product and format names look like variants | **Confirmed.** | #2 Luxury Box (Jev item type 0.47 sealed), #10 H2, #13 Crusade. |
| 5 | Inferred values stored as confirmed | **Confirmed.** | #12 "CJ" stored by Jev as `accepted`, player confidence 1.0, `playerSource: catalogue`, no product. The acceptance rule never distinguishes stated from inferred. |
| 6 | Low-confidence guesses are accepted | **Partly wrong.** | #1's 0.43 soccer answer was **not** accepted: `review_status = needs_review`, reason `low_confidence_sport`. The real defects: (a) `jevMinConfidence` is 0.7 but nothing stops a *confidence 1.0* wrong answer (#3); (b) the sport was asked independently although the product match already implied basketball (product confidence 1.0). |
| 7 | Decisions lean on historical priors | **Confirmed, in the Standard classifier.** | `product-classification.ts` hard-codes `NBA_CARD_PRODUCT_PATTERNS` (brand/product names), `NON_NBA_SPORT_PATTERNS` ("Football", "Baseball", "World Cup", "Qatar" veto NBA), and `CARD_HEAVY_SOURCE_SLUGS` (a store boost). Jev's sport question has a fixed list of sports and no catalogue link. |

Additional root causes found while verifying (not in the brief):

| # | Cause | Evidence |
|---|---|---|
| 8 | **The Jev acceptance rule requires no catalogue grounding.** `classifier.ts` ends: accepted if there is a player and item type and sport confidences are >= 0.7. A missing product is "recorded as a reason but does not block it". | #3, #10, #12, #20 all `accepted` with `product_not_in_catalogue`. |
| 9 | **Catalogue coverage.** 57 products, 2019-20 to 2025-26, Panini plus 3 Topps. Fixtures #2, #3, #10, #11, #12, #13, #15, #20 are for products that are absent. | See section 1 and section 6. |
| 10 | **Jev product miss is recorded as "not in catalogue".** #9: the Donruss 2024-25 product was a single exact candidate, yet the model gave it 0.04. The stored reason `product_not_in_catalogue` hides that the product is in the catalogue. | `raw_signals.productConfidence = 0.04`. |
| 11 | **Importer flattens base sub-blocks.** The source checklist declares "Crusade - #516-545" and "Rookies and Stars - #651-675" inside Base; the catalogue has them as one "Base Set". Parallels for the blocks are lost (#17). | `docs/sets/incoming/2020-21-Panini-Chronicles-Basketball-Checklist.xlsx`, sheet Base. |
| 12 | **`checklist_cards.is_rookie` is almost never set** (705 of 63,336 cards). Rookie status in practice comes from title regex and store tags. | Rookie Variations #121 Carrington has `is_rookie = false`. |
| 13 | **The alias table exists and is unused.** `player_aliases` has 0 rows and no code reads it. Nicknames ("Poku", "CJ") are resolved only by the model's fuzzy pick. | #12, #14. |
| 14 | **`isAutograph` is a title regex that matches `signature(s)`** and is never cleared by the catalogue. | `title-fields.ts`; #11. |
| 15 | **Confidence is not comparable across classifiers.** Standard's `confidence` is a field-completeness score (0.35 + bonuses, capped 0.9). Jev's is the model's probability for its chosen option, which can be 1.0 and wrong (#3). Neither measures agreement with the catalogue. | `confidenceForClassification`; `raw_signals`. |
| 16 | **Multi-player cards are skipped.** `catalogue-index.ts` ignores card names containing `/` or `&` when building the player index (#15). | `CatalogueIndex` constructor. |
| 17 | **Same number, same player, two base subsets.** #121 Bub Carrington is in both "Base Set" and "Rookie Variations"; #47 Aaron Gordon is in both "Base Season Ticket" and "Ticket Stub" (/50). The matcher has no rule for choosing. | Catalogue queries for #1 and #16. |
| 18 | **Players resolve to an ID only through Jev.** Standard resolves a player ID for 0 of 8,206 NBA listings, Jev for 91%. Reconciliation compares `player_name ilike full_name`, so padded names never match. | Production counts; open issue CAR-26. |

## 3. Where the brief and the catalogue disagree

The fixtures follow the catalogue. These differ from the brief (all verified by query on 2026-10-12):

| # | Brief | Catalogue says |
|---|---|---|
| 1 | Jev "accepted" the soccer guess | It was `needs_review`, not accepted. |
| 7 | Year not in the visible title; Possible | Stored title starts "2020-21 Panini Mosaic ..." so the year is present. Card is **Confirmed**; only the parallel is ambiguous. |
| 9 | "International Stars" insert, Red /125 parallel | 2024-25 Donruss **base** #30, parallel **"International Red Stars /125"**. No such insert subset. |
| 10 | Possible, Disco Blue vs Tie-Dye | **2024-25 Select is not in the catalogue.** Unmatched (catalogue gap) until imported. |
| 14 | Confirmed with catalogued alias | `player_aliases` is empty; no card number; and the base Rated Rookie card is missing from the catalogue (only autograph subsets list him). **Possible.** |
| 17 | #523 is in the Crusade subset | True in the source xlsx (Crusade = #516-545), but the catalogue stores it under "Base Set" with no Silver/Crusade parallel. Card-level match still Confirmed. |
| 18 | Supernatural numbered 99 down to 1 | Catalogued as separate parallels (Playoff Ticket /99, Cracked Ice /25, Championship Edition /1). An unnumbered listing is the base insert. |

Not verifiable with the current catalogue (marked `not_in_catalogue` in the fixtures): #2, #3, #10, #11, #12, #13, #15, #20. I could not confirm "Collector's Choice" (#11), what HRX is (#12), or whether Crusade is the product (#13).

## 4. Principles

1. **Evidence over priors.** The catalogue is the source of truth. Priors may break ties, never veto. Unknown is not out of scope.
2. **No field is trusted on its own.** Title, description, URL slug, photo, tags and `product_type` are claims.
3. **Precision over recall.** Unmatched and possible are healthy outcomes.
4. **Stages stay separate.** Classification (what is this listing) and product-card matching (which catalogue card) are separate; the spec only changes what each stage may *assert*.

## 5. The spec

### 5.1 Output record (explainability)

Every classification and match stores, per field, **value, status and source**:

```
field:   player | year | product | subset | card_number | parallel | serial | rookie | autograph | sport | item_type
value:   normalised value
status:  stated   (written in a listing field)
         derived  (determined by the catalogue, e.g. sport from product, player from card number)
         inferred (alias, nickname, template, prior)  -> caps the result at Possible
source:  title | description | slug | tags | product_type | catalogue | alias_table
```

Plus `confidence_tier`, `match_reasons[]`, `flags[]`, `matcher_version`. Today this lives in free-form `raw_signals`; the spec moves it to structured evidence so the dashboard and admin can show it.

### 5.2 Field trust and validation

1. Extract a **reading** from each field independently: title, description, slug, tags, product_type. Tags and product_type are readings too.
2. **Resolve each reading against the catalogue** (set + number + player together). A reading that resolves to a real card beats one that does not, whichever field it came from.
3. If two readings resolve to **different real cards**, the listing is **ambiguous: cap at Possible** and flag `field_conflict`.
4. If a reading **does not resolve** (for example #4's description names a catalogued-nowhere card), it is ignored and recorded as `description_conflict_ignored` (not a failure).
5. **Duplicate-listing signal.** A slug containing `-copy`, or a slug whose player or number differs from the title, lowers the weight of slug, description, tags and product_type for that listing (not the title). Flag `duplicated_listing`.
6. **Store-level fields never decide sport.** `product_type` and `tags` can add a candidate; they cannot assert sport (#3).

### 5.3 Matching order (backbone: year, set, number, player, parallel)

1. **Year is a soft constraint.** Normalise; allow +/- 1 season. If the exact-year search finds nothing, widen and record `year_widened` in the reasons (#19). Widening caps the result at Possible.
2. **Set / subset / insert come from the catalogue vocabulary for that year.** Only names that exist in the year-scoped checklists are accepted. Match on normalised tokens ignoring spaces and punctuation ("Super Natural" = "Supernatural", "Shock Wave" is one name).
3. **Product match is deterministic when unambiguous.** If exactly one product has its alias and season in the title, accept it in code; use the model only to arbitrate between several candidates (fixes #9's 0.04).
4. **Card number before player.** Set + number is nearly a unique key within a subset. Cross-check the player; disagreement caps at Possible. Where several subsets contain the same number and player (#1, #16), prefer the base subset unless the title names the other, and record `subset_candidates`.
5. **Player resolution** uses stated names first, then the alias table, then description. Multiple players are allowed (#15). Alias- or nickname-derived players are `inferred`.
6. **Insert / subset is read from the matched checklist row**, never from keywords.
7. **Parallel resolves last** against that subset's own parallel list, longest-match, with serial agreement. If the serial fits more than one parallel, keep the card and flag `parallel_ambiguous`. A parallel absent from the catalogue is `parallel_unresolved` and does not block the card match (#17).
8. **Autograph and relic** are true only when the matched checklist row is of kind autograph / memorabilia. "Signature" in a title alone is not an autograph (#11).

### 5.4 Year normalisation

- "2023-24" is a season; "2023-2024" and "2023/24" normalise to it.
- A bare year "2002" means candidates 2002-03, then 2001-02 (existing behaviour in `parseSeason`), widened by one more if nothing resolves.
- Calendar-year products (Bowman, Topps Chrome 2025) need an explicit year-to-season map per product, stored with the product. Assumption: the existing `season` string on `checklist_products` is authoritative (for example 2025-26 Topps).

### 5.5 Aliases

- `player_aliases` already exists (`player_id, alias, normalized_alias, source, confidence`) with 0 rows. Use it.
- Seed from the catalogue (first names, initials, known nicknames) and from confirmed admin corrections. Each alias has `source` and `confidence`.
- **Resolution rule:** an alias is `stated`-grade only if it is catalogued, unambiguous across the catalogue *and* agrees with the set and card number. Otherwise it is `inferred` (caps at Possible).
- First-name-only nicknames ("CJ") are never stated-grade on their own (#12).

### 5.6 Catalogue gaps

- If a listing carries strong player evidence (catalogued NBA player, card-like title) and **no checklist matches**, return `unmatched: catalogue_gap`. **Do not** reclassify to another sport and do not drop it as out of scope.
- Out of scope requires **positive** evidence of another sport (a catalogued non-basketball product or player). Absence from the catalogue is not that evidence.
- **Gap queue (admin).** Group unresolved listings by (season, product name guess) with counts and example links, so the most valuable checklist to import is obvious. From today's data: 6,443 unresolved; the largest 2019+ clusters are 2019-20 Hoops Premium Stock, 2019-20 Mosaic, 2021-22 Donruss Elite, 2019-20 Prizm, 2023-24 Spectra, 2023-24 Recon.

### 5.7 Vendor profiling (staged, later)

- Per store and per field, count how often a field was later contradicted by a confirmed correction (admin review, "not a match" feedback). Weight fields by the observed rate.
- Computed, never hard-coded. Needs data from the admin review surface (CAR-67) first, so it is **phase 5**, not part of the first build.
- Until then, the duplicated-listing signal (5.2.5) covers `-copy` slugs without a profile.

### 5.8 Confidence tiers and acceptance

Tiers map to the master context (section 11): high 0.90-1.00, strong 0.75-0.89, possible 0.60-0.74, below 0.60 hidden. Confidence comes from **which fields agreed**, not from a model probability.

| Outcome | Condition |
|---|---|
| **Confirmed** (current) | Product, number and player agree in the catalogue; no unresolved field conflict; no inferred player; no year widening. |
| **Possible** | Set and player agree but no card number; **or** year widened; **or** player inferred; **or** an unresolved field conflict. |
| **Unmatched** | No candidate passed. Always records a reason: `catalogue_gap`, `out_of_scope`, `insufficient_fields`, `sport_unresolved`. |

**Acceptance rule (replaces Jev's):** a classification may be used for watchlist matching only if it is grounded in a catalogue product (so sport is `derived`, not guessed). No catalogue product means `catalogue_gap` and never `accepted`. Model confidence is an input, never the grounding.

### 5.9 Where Jev fits

Keep Jev as a **closed-set chooser inside this pipeline**: code builds candidate lists from the catalogue and validates the answer against the catalogue; Jev picks among the options. Its answers become `stated` or `derived` only after the catalogue confirms them. Sport is no longer a separate Jev question; it is derived from the matched product, and the sport question is kept only to detect positive out-of-scope evidence. This also addresses the master-context conflict (D-006).

### 5.10 Photos

Out of scope. Image verification was considered and cancelled for cost (CAR-70). If revisited it is a separate stage with its own confidence and needs its own Decision. The fixtures record where text alone is insufficient (#7 parallel, #10 parallel) so the question can be re-asked with data.

## 6. Catalogue coverage (the biggest lever)

| Measure | Value |
|---|---|
| Active basketball singles (Jev-classified, active stores) | 10,786 |
| Product resolved in catalogue | 4,343 (40%) |
| Product not resolved | 6,443 (60%) |
| of which year before 2010 | 2,638 |
| of which 2010-2018 | 984 |
| of which 2019 or later | 2,215 |
| of which no year parsed | 606 |
| Catalogue | 57 products, 2019-20 to 2025-26 |

Two different problems: (a) **2019+ products not yet imported** (about 2,215 listings; cheap, the importer exists, source files are checklists), and (b) **pre-2019 vintage** (about 3,600 listings; needs a decision on scope and source data). See D-007.

## 7. Rollout (smallest first)

Each phase ships alone and can be measured with the accuracy set (CAR-63) and the fixtures.

| Phase | Change | Fixtures it fixes |
|---|---|---|
| A | Acceptance requires catalogue grounding; sport derived from product match; inferred players cap at Possible; autograph from the checklist row; distinct reasons for `not_in_catalogue` vs `model_rejected`; deterministic accept of a single exact product candidate | #1, #3, #9, #11, #12 |
| B | Catalogue: preserve base sub-block ranges, set rookie flags, import 2019+ gaps (2024-25 Select first), then decide vintage scope | #10, #17 (and others once imported) |
| C | Seed and use `player_aliases` | #12, #14 |
| D | Field-trust resolution: reading per field, resolve against the catalogue, conflict caps, duplicate-listing signal, year widening | #4, #5, #19, #20 |
| E | Multi-player cards, subset ambiguity rule | #15, #1, #16 |
| F | Catalogue-gap queue in admin; vendor profiling | all gaps |

## 8. Assumptions and unverified items

Everything below was **not** verified against a checklist and is an assumption:

- Brief's claims about *Collector's Choice* for the 1994 Shaq card (#11), *HRX* (#12), and *Crusade* as the product for 2013-14 (#13).
- That Luxury Box is a product/variation name for 2007 Topps (#2).
- That H2 is a box format and that Disco Blue and Tie-Dye are both /25 in 2024-25 Select (#10). Select 2024-25 is not in the catalogue.
- That "Mosaic Prizm" corresponds to the parallel named "Mosaic" in the Will to Win insert (#7).
- That Bowman basketball exists with a BCP-10 Shelton Henderson, and that he is not a baseball prospect (#3). Not catalogued.
- That the live page titles equal the stored titles (#7 suggests they may differ).
- That the importer, not the source file, drops the Optic 2020-21 base Rated Rookie card for Pokusevski (#14). Not investigated.
- That `checklist_cards.is_rookie` is under-populated because of the importer (705 of 63,336), not because the checklists omit it. Not investigated.
- The vendor-profiling design assumes enough confirmed corrections will exist; there are currently 4 `match_feedback` rows.

## 9. Decisions needed

- **D-005:** What customers see for listings with strong player evidence but no catalogue product (catalogue gap). Options: hide until the catalogue covers them; show as Possible; show only for player-only watchlists. Changes customer-visible behaviour.
- **D-006:** Jev's role against the master context ("rules-first, not a black-box AI matcher"). Recommendation: closed-set chooser, validated by the catalogue, never the grounding (5.9). Extends D-001.
- **D-007:** Catalogue scope and priority: import the 2019+ gaps first, and decide whether v1.0 covers pre-2019 vintage (3,600 listings) and from which source.
- Image verification: no new Decision. It stays cancelled (CAR-70); revisit only if the labelled set shows photo-caused misses.

## 10. Linear

Project: NBA Singles MVP (the P1 to P5 phase projects do not exist in the workspace; `[P3]` is in the title).

| Issue | What | Depends on |
|---|---|---|
| CAR-73 | Decision D-005: what customers see for catalogue-gap listings | none |
| CAR-74 | Decision D-006: Jev's role against the master context | CAR-59 |
| CAR-75 | Decision D-007: catalogue scope and import priority | none |
| CAR-76 | Structured match evidence (value, status, source) | none |
| CAR-77 | Importer: sub-block ranges, per-block parallels, rookie flags | none |
| CAR-78 | Acceptance requires catalogue grounding; sport derived from product | CAR-76, CAR-73, CAR-74 |
| CAR-79 | Single exact product candidate accepted in code; distinct reasons | CAR-76 |
| CAR-80 | Autograph / relic from the checklist row | CAR-76 |
| CAR-81 | Seed and use `player_aliases` | CAR-76 |
| CAR-82 | Field trust: readings per field, conflicts cap at Possible | CAR-76 |
| CAR-83 | Year normalisation and +/-1 widening | CAR-76 |
| CAR-84 | Multi-player cards; same-number subset ambiguity | CAR-76 |
| CAR-85 | Import 2019+ checklist gaps (2024-25 Select first) | CAR-75, CAR-77 |
| CAR-86 | Catalogue-gap detection and admin queue | CAR-76, relates CAR-67 |
| CAR-87 | Behavioural tests from the 20 fixtures | CAR-76 |
| CAR-88 | Vendor field-reliability profiling (later) | CAR-67, CAR-76 |

Related existing issues: CAR-26 (player identity resolution), CAR-37 (catalogue-backed watchlists), CAR-59 (D-001), CAR-63 (accuracy set), CAR-67 (admin review surfaces), CAR-70 (photo classification, cancelled).
