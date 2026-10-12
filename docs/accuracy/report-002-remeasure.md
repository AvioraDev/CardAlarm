# Re-measurement after the CAR-77 re-import and v2 reclassification (2026-10-12)

Scope: all 12,659 listings that had a Jev (v1) classification, reclassified with `jev-catalogue-v2` against the corrected catalogue. Readers still use the Standard classifier (D-001); nothing customer-facing changed.

## Run

| Stage | Listings | Failures | Input tokens | Cost | Time |
|---|---|---|---|---|---|
| Stage 1: detached rows (two runs, the first stopped by the 20% cost guard) | 3,213 | 0 | ~5.15M | $0.216 | 178 s |
| Stage 2: all other Jev rows | 9,446 | 0 | 9.50M | $0.399 | 317 s |
| Total | 12,659 | 0 (0%) | ~14.65M | $0.615 | ~8 min |

Price: $0.042 per million input tokens, output free (third-party sources; TypeSafe publishes no pricing page).

## 1. Fixtures (20 real listings), stored v2 result vs expected outcome

18 of 20 match. Differences:

- **#14 (2020-21 Optic Pokusevski, no card number):** expected *possible*, now *unmatched*. The title says "Panini Optic"; no product alias maps bare "Optic" to Donruss Optic when "Donruss" is absent, so no product is found. Importing the Base sheet means this player/number now exists in the catalogue (Rated Rookies #167), so a matcher alias fix could resolve it. Matching-rule fix, not an importer problem.
- **#16 (2023-24 Contenders #47 Aaron Gordon "Season Ticket"):** expected *confirmed*, now *possible*. The re-imported catalogue holds #47 Aaron Gordon in two base subsets, "Base Season Ticket" and "Ticket Stub"; the matcher will not choose between them. The title says "Season Ticket"; a rule that prefers the subset whose name appears in the title would confirm it.

Standard vs v2 on the same 20 (D-008 evidence):

| # | Standard (customers today) | Jev v2 |
|---|---|---|
| 16 | player "Aaron Gordon Season Ticket" | player "Aaron Gordon", possible |
| 18 | player "Kyrie Irving Super Natural" | "Kyrie Irving", Supernatural, accepted |
| 8 | player "Jalen Hood-Schifino Rookie Card Vortex" | "Jalen Hood-Schifino", Vortex, accepted |
| 17 | player "James Wiseman Rookie Card Crusade Silver", product "Chronicles Rookies And Stars" | "James Wiseman", Chronicles, Crusade #523, accepted |
| 6 | Revolution, no subset | Revolution, Shock Wave, accepted |
| 5 | Prizm, no subset | Prizm Base Set #19, accepted |
| 19 | "JA Morant Sky View", 2020-21 | "Ja Morant", Skyview, 2021-22, possible (year widened) |
| 11, 20 | NBA, 1994/2002 Upper Deck, player padded | unmatched (product not in catalogue), player kept |
| 3, 2 | no category | unmatched |

Fixture 6 is the "Shock Wave" case: Standard put the parallel in the player or dropped it; v2 names it as the subset.

## 2. Status split, compared with last round

All 12,659 listings with Jev rows (all currently live):

| Status | v1 (before) | v2 (now) | Last round's 400-listing dry run (v2, old catalogue) |
|---|---|---|---|
| accepted | 10,622 (83.9%) | 4,005 (31.6%) | 120 (30.0%) |
| possible | n/a | 249 (2.0%) | 24 (6.0%) |
| unmatched | n/a | 6,657 (52.6%) | 198 (49.5%) |
| out_of_scope | 1,785 (14.1%) | 1,748 (13.8%) | 58 (14.5%) |
| needs_review | 252 (2.0%) | 0 | n/a |
| accepted **with a catalogue card** | 1,071 (8.5%) | 4,005 (31.6%) | n/a |

The full run matches the 400-listing prediction (accepted 31.6% vs 30%, unmatched 52.6% vs 49.5%). "Possible" is lower (2.0% vs 6.0%), because rows the old catalogue could not ground are now either found (the importer fix) or unmatched. Every v2 accepted row is grounded in a catalogue card; 90% of v1 accepted rows were not.

Stage 1 (the 3,213 detached rows): accepted 2,781 (86.6%), possible 159, unmatched 273.
Stage 2 (9,446 others): accepted 1,224 (13.0%), possible 90, unmatched 6,384 (67.6%), out_of_scope 1,748.

## 3. Unmatched frequency table (`unmatched-frequency-002.csv`)

6,563 live basketball singles are unmatched with no product (v1 table: the equivalent of 6,420). 2019-20 onward: 2,397 listings in 218 groups; before 2019: 3,923 in 484 groups (60%; was 61%). The pre-2019 figure is unchanged, so the importer fix did not move it, as expected. Unparsed: 243.

Note: the table is reporting-only and counts a title containing "Silver Prizm" as product "Prizm", which over-counts Prizm for titles of other products.

## 4. The 416 listings (2019-20+, product in the catalogue, Jev failed)

Now 598 under the v2 definition (not comparable one-to-one: v2 stores no product for an unmatched row). Why they are unmatched (`catalogued-unmatched-002.csv`):

| Cause | Listings |
|---|---|
| Card number conflicts with the product (decision b, by design; no product stored) | 526 |
| Player found, matcher did not identify the product (alias/season gap) | 53 |
| Player and product found, no card row agrees | 16 |
| No catalogue player in title or tags | 3 |

What the importer fix resolved: not measurable as a drop in this count, because the v2 rules are stricter than v1. What it did resolve: stage 1 detached rows were re-linked (2,781 accepted with a card) and fixtures that need the Base sheet and blocks (Pokusevski #167, Wiseman #523 in Crusade) now exist in the catalogue.

Of the 526 conflicts: 173 have prefixed card numbers (e.g. `SW-AYO`, `PRA-EVM`, `SS-KDN`; inserts), 353 are numeric. At least 71 are titles of another product carrying a "Prizm" parallel, mis-grouped as Prizm by the report. Remaining numeric conflicts (e.g. Chronicles Draft Picks, Marquee Draft Picks) need a per-case look: they look like products or subsets the checklists do not list, or a number printed differently.

Proposed matching-rule fixes (not implemented, for approval):
1. A bare "Optic" in a title maps to Donruss Optic when no other Optic product (Contenders Optic) is named. (#14, and part of the 53.)
2. When several base subsets hold the same number and player, prefer the one whose name is contained in the title ("Season Ticket"). (#16.)
3. Prefixed insert numbers (`SW-`, `PRA-`, `SS-`): check how the checklists store them and compare on the normalised form.
4. Drop the bare-parallel false product (reporting parser only).
