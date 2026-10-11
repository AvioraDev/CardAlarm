# Matcher error analysis and matching spec (v2 draft)

Status: **decisions D-005, D-006 accepted and D-007 accepted (provisional) on 2026-10-12.** This document changes no matcher code; the first code change is CAR-78 (separate PR).
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

### 3.1 Corrections after outside verification (12 Oct 2026)

- **Fixture 3 flips.** Shelton Henderson BCP-10 is in **2025-26 Topps Bowman Basketball**, so the card is basketball (two checklists; section 8). The earlier labelled-set label "baseball" came from the brand prior this spec forbids, and is corrected. Jev's "basketball" answer was right, though for the wrong reason (a store `product_type` copied from an NBA listing), so the acceptance rule is still wrong: it must require a catalogue product. Expected today: `catalogue_gap`; once Bowman basketball is imported: confirmed.
- **Fixture 10** gains a resolution: H2 is a box format and the /25 parallels are Tie-Dye (Hobby-exclusive) and Blue Disco (H2-exclusive), so H2 plus /25 points to Blue Disco once 2024-25 Select is imported.
- **Fixture 11:** product resolved as 1994-95 Upper Deck Collector's Choice; autograph vs facsimile is **unresolved**, so autograph status is "unknown".
- **Fixture 12:** HRX is the "HRX Rookies" insert inside 2013-14 Panini Prizm (CJ McCollum #5); other CJ players in the insert are unresolved.
- **Fixture 13:** Crusade is the product; the card is #71.

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
4. **Card number before player.** Set + number is nearly a unique key within a subset. Cross-check the player; **a number that is not this player's card in the product is `unmatched` with reason `card_number_conflict` and no product is recorded** (founder decision 2026-10-12: a wrong product guess is a bad match; the listing still reaches the player's watchlist through the D-005 path). Where several subsets contain the same number and player (#1, #16), prefer the base subset unless the title names the other, and record `subset_candidates`.
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

### 5.8.1 What customers see for listings with no catalogue product (D-005, accepted)

- They may appear only in a **separate section of the matching player's watchlist**.
- Show **only what the store provides**: title, photo, price and a link. Show no set, parallel, card number or autograph status, because none is confirmed.
- They **never trigger alerts**. Alerts go to confirmed matches only. Opt-in alerts for possible matches are a later decision.
- Wording avoids internal jargon. Suggested: "We found this listing for [player] but couldn't confirm the exact card." Flagged for beta testing.
- They **never count as confirmed matches** in any metric, export or downstream stage.

### 5.9 Where Jev fits (D-006, accepted)

Jev has a bounded role, which is how it satisfies the master context's "rules-first, explainable, not a black-box AI matcher" rule:

- **Rules generate the candidates.** Jev may only choose from catalogue rows produced by year, set, card number and player matching.
- **Rules decide acceptance.** A match is accepted only if it maps to a catalogue row and the card number and player agree with that row. Jev's score is a tiebreaker within the allowed candidates and can never bypass these rules. With a single exact candidate there is nothing to tie-break, so rules accept it.
- **Sport, product type, insert or subset, and autograph status come from the matched catalogue row.** With no matched row, autograph status is "unknown", never "yes".
- **Matcher version and Jev's score are recorded on every match**, so Jev's contribution can be measured separately.

Implementation note (CAR-78, founder decision 2026-10-12): for listings that match no catalogue row, item-type and sport hints are still stored, labelled as hints, and used only to tell "not a basketball card" from "catalogue gap". They can never accept a match, drive an alert or change what customers see. **A hint may mark a listing `out_of_scope` only when no known NBA player is named in the title, a tag or the product type**; with one named, a confident hint for another sport leaves it `unmatched` (the model once said soccer for a basketball card).

### 5.10 Photos

Out of scope. Image verification was considered and cancelled for cost (CAR-70). If revisited it is a separate stage with its own confidence and needs its own Decision. The fixtures record where text alone is insufficient (#7 parallel, #10 parallel) so the question can be re-asked with data.

## 6. Catalogue coverage (the biggest lever)

| Measure | Value |
|---|---|
| Active basketball singles (Jev-classified, active stores) | 10,786 |
| Product resolved in catalogue | 4,343 (40%) |
| Product not resolved | 6,443 (60%) |
| Catalogue | 57 products, 2019-20 to 2025-26 |

Frequency table (task 3.1, deterministic title parser, not Jev): `docs/accuracy/unmatched-frequency-001.csv`.

| View | Listings | Share of unmatched |
|---|---|---|
| 2019-20 onward | 2,283 | 35% |
| of which the product is already catalogued (matcher misses) | 416 | 6% |
| of which a real gap | 1,867 | 29% |
| Before 2019 | 3,917 | 61% |
| Unparsed (kept separate) | 243 | 4% |

Findings: the largest single group is 146 listings (2.3%); the ten largest real gaps cover 722 listings (11%). Importing checklists cannot fix the 60% alone; vintage is most of the volume, so the D-005 path carries most of it. 416 listings are matcher misses on catalogued products (CAR-79), not import work.

Proposed import order (D-007, provisional; **no import before the importer fix, CAR-77**): 2019-20 Hoops Premium Stock (146), 2019-20 Prizm (133), 2022-23 Chronicles (112), 2025-26 Topps Chrome (81), 2023-24 Recon (47), 2021-22 Illusions (43), 2019-20 Status (41), 2020-21 Contenders (40), 2020-21 Court Kings (40), 2025-26 Topps Hoops (39). Also in scope per D-007: **2025-26 Topps Bowman Basketball** (fixture 3), and 2024-25 Select (fixture 10).

Importer audit (task 3.2): `docs/architecture/checklist-importer-audit.md`. 2,618 of the 4,343 catalogue-resolved classifications point at a product the importer got wrong, so the importer fix precedes every import.

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

## 8. Verification status of the open items (2026-10-12)

Researched from outside checklists. Where a source could not be read, the item is unresolved; I did not fall back on what usually happens.

| # | Question | Status | Answer and sources |
|---|---|---|---|
| 3 | Is Shelton Henderson BCP-10 in a Bowman basketball release? | **Resolved (2 sources)** | Yes: Chrome Prospects BCP-10 Shelton Henderson (Miami) in **2025-26 Topps Bowman Basketball**, released 2026-04-22. Also CPA-SH, FS-SH, BPP-10. [degreegrading.com](https://degreegrading.com/checklists/2025-26-bowman-basketball/), [checklistinsider.com](https://www.checklistinsider.com/2025-26-bowman-basketball). The "Reptilian Refractor" name was not found in either. Beckett was in maintenance. **Consequence:** the card is basketball; the earlier "baseball" accuracy label was wrong and is corrected. |
| 10 | Is H2 a box format? Which 2024-25 Select parallels are /25? | **Resolved (single source)** | H2 is a box format ("H2 Box: 6 cards per pack, 4 packs per box"). The /25 parallels are Tie-Dye (Hobby-exclusive) and Blue Disco (H2-exclusive); H2 boxes carry the Disco parallels. [cardboardconnection.com](https://www.cardboardconnection.com/2024-25-panini-select-basketball-set-review-and-checklist). Not checked: whether tiers (Concourse / Premier / Courtside) change the /25 parallels. **Consequence:** H2 plus /25 points to Blue Disco, so the parallel is resolvable once the product is imported. |
| 11 | Is "Tip-Offs Silver Signature" #184 Shaq from 1994-95 Collector's Choice? | **Partly resolved** | Product and number: yes, 1994-95 Upper Deck Collector's Choice, #184 titled "Tip Offs", parallel "Silver Signature" (COMC: "Silver Foil Signature"; International variants exist). Source: COMC and eBay listing titles from search; the pages themselves returned HTTP 403. **Unresolved:** whether the signature is printed facsimile or an autograph. No readable source states it. Autograph status stays "unknown". |
| 12 | What is the 2013 Panini HRX product, and which CJ players appear? | **Partly resolved** | HRX is an **insert (HRX Rookies) inside 2013-14 Panini Prizm**, not a standalone product; C.J. McCollum is #5 (also seen: Shane Larkin #20, Ryan Kelly #18). Sources: marketplace titles ([Amazon](https://www.amazon.com/McCollum-Rookie-2013-14-Panini-Prizm/dp/B0CWVHM81Q), [Hollywood Collectibles](https://hollywoodcollectibles.com/products/c-j-mccollum-2013-panini-hrx-rookie-card), COMC and eBay titles). **Unresolved:** the full HRX Rookies list, so whether another CJ/C.J. appears. TCDb returned 403 and Beckett was down. |
| 13 | Is Crusade the product for the 2013-14 Steven Adams card, and what number? | **Resolved (single source)** | Crusade is a standalone 2013-14 Panini basketball product; "71 Steven Adams" in the Crusade set (also #123 Rookies Set, #5 Apprentice Signatures). Orange Die-Cut /99 is a Crusade parallel and does not apply to the separate base set. [cardboardconnection.com](https://www.cardboardconnection.com/2013-14-panini-crusade-basketball-cards). |

Sources that failed: beckett.com (maintenance redirect), comc.com / tcdb.com / sportscardspro.com (HTTP 403), sportscardradio.com (connection refused).

Remaining assumptions (not verified):

- That "Mosaic Prizm" in fixture 7 corresponds to the parallel named "Mosaic" in the Will to Win insert.
- That live page titles equal the stored titles (fixture 7 suggests the brief saw a different title).
- The vendor-profiling design assumes enough confirmed corrections will exist; there are 4 `match_feedback` rows today.
- Rookie semantics per product (whether "Rated Rookies" always means rookie).

## 9. Decisions (recorded 2026-10-12)

- **D-005 accepted** (CAR-73): see 5.8.1.
- **D-006 accepted** (CAR-74): see 5.9.
- **D-007 accepted, provisional** (CAR-75): v1.0 confirmed scope is 2019-20 onward plus current releases, including Topps and Bowman basketball. Pre-2019 listings use the D-005 path; import selected older products only where the frequency table shows large clusters; choose import order by listing volume. Provisional until the frequency table is reviewed.
- Image verification: no new Decision. It stays cancelled (CAR-70).

## 10. Linear

Projects: P1 MVP Verification, P2 Durable Scan Platform, P3 Identity & Accuracy, P4 Consumer Completeness, P5 Beta & Launch (created 2026-10-12). CAR-73 to CAR-88 are in P3.

| Issue | What | Depends on |
|---|---|---|
| CAR-73 | Decision D-005: what customers see for catalogue-gap listings | none |
| CAR-74 | Decision D-006: Jev's role against the master context | CAR-59 |
| CAR-75 | Decision D-007: catalogue scope and import priority | none |
| CAR-76 | Structured match evidence (value, status, source) | none |
| CAR-77 | Importer fix: subset detection, base blocks, rookie flags, validation (blocks all imports, CAR-85) | none |
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
