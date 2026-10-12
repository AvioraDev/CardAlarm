# Matcher fixes before the reader switch (CAR-92) and re-measurement (2026-10-12)

Classifier `jev-catalogue-v3` (PR #19). Full reclassification of the 12,659 listings that had a Jev row: 0 failures, 14.59M input tokens, **$0.613**, 499 s.

## What changed

1. **Card numbers are compared for format, not relaxed.** Case, hyphens and spaces, leading zeros, and the subset prefix a seller copies from the card back ("SS-26" is number 26 of "Signature Selections": the prefix must equal that subset's initials). A different number is still a different number, and a bare "26" never matches "SS-26". A genuine conflict stays `unmatched` with `card_number_conflict` and no product stored.
2. **Product aliases are generated from the catalogue** (`generateProductAliases`), not listed in code: the line, the trade name in the checklist file name ("NBA Hoops"), the line without a family prefix that is itself a product line ("Optic" for Donruss Optic), and a longer line from another season that ends with this line ("Donruss Elite" for 2021-22 "Elite"). A suffix is refused when it is another product's name that season, or a parallel or subset name anywhere in the catalogue. Against the live catalogue it produces exactly three extra aliases: `optic`, `donruss elite`, `nba hoops`, and never `black` (Prizm Black) or `kings` (Court Kings).
3. **A title that names exactly one candidate subset chooses it** ("Season Ticket" selects "Base Season Ticket", not "Ticket Stub").
4. **Parallel names are masked when finding a product** ("Silver Prizm" is not the Prizm product), in the matcher and in the frequency script. If masking leaves no product, the text as written is used.
5. **Conflicts carry a type**, so the remainder can be counted.
6. Fixture snapshot rebuilt from the corrected catalogue (`export-catalogue-snapshot.ts`); fixtures 1 and 4 now expect the real block subsets "Rookies" and "Veterans".

## Fixtures

**20 of 20 pass offline** (`matcher-fixtures.test.ts`, Jev stubbed). Against the **live** model (stored v3 rows): **19 of 20**. Fixture 16 (Aaron Gordon, "Season Ticket") is now `accepted` in "Base Season Ticket". Fixture 14 (Pokusevski, "Panini Optic ... Silver Prizm") is a candidate for Donruss Optic now, but the live model abstains (Prizm 0.36, Optic 0.10, none of these 0.54), so it stays unmatched. The offline test pins the model's choice to Optic, as it always did; it is a model call, not a rule, and I left it unmatched rather than force it (a bad match is worse than none).

## Split, before and after (12,659 listings)

| Status | v2 (before these fixes) | v3 (after) |
|---|---|---|
| accepted | 4,005 (31.6%) | 4,034 (31.9%) |
| possible | 249 (2.0%) | 221 (1.7%) |
| unmatched | 6,657 (52.6%) | 6,653 (52.6%) |
| out_of_scope | 1,748 (13.8%) | 1,751 (13.8%) |

38 listings changed status: 32 became accepted (the title-names-a-subset rule and aliases), 3 left accepted, the rest moved between possible and unmatched.

## Card-number conflicts: how many were format, how many genuine

Live conflicts across all seasons: 926 before, 928 after. **Only 2 were pure format mismatches** (they became accepted), and 3 more resolved to a different outcome. The big number in the earlier report was not mostly formatting. The remaining 921 split by type:

| Type | Listings (all seasons) | Of the 2019-20+ catalogued group |
|---|---|---|
| Player has no card in the named product | 363 | 129 |
| Number belongs to another player | 320 | 223 |
| Insert code not in the checklist (`AM-KOJ`, `RS-DLV`, `APR-ANF`) | 238 | 170 |
| Number not in the named product | 7 | 5 |

What the samples show:
- *Player has no card in the product*: mostly other sports and brands that share a product name (Topps Universe WWE, UFC, Premier League, Donruss Haaland). These are correctly unmatched.
- *Number belongs to another player*: titles of products that are not in the catalogue and borrow a catalogued name (Spectra, Clearly Donruss, Topps Chrome 2025) or a printing mismatch. Genuine for the catalogue as it stands.
- *Insert code*: the title prints `<subset initials>-<player code>`, the checklist lists a plain number. This is a different problem from format: the code cannot be compared with a number. **For 90 of these 238** the subset prefix equals the initials of a subset in which the named player has a card (2 more are ambiguous). That would support a **Possible** (product, player, subset known; number unverifiable), never a confirmed match. I did not implement it: it is a new rule, not a number comparison, and it needs a decision.

## Unmatched frequency (`unmatched-frequency-003.csv`)

6,560 unmatched (was 6,563). 2019-20 onward: 2,394 listings in 218 groups; before 2019: 3,923 in 482 groups (59.8%). The catalogued-but-unmatched group is 597 (was 598). The Prizm over-count from "Silver Prizm" is gone from the table.

## Still open

- The 90 insert-code listings above (decision needed).
- The model's abstention on bare "Optic" (fixture 14).
- Products that are not in the catalogue and borrow a catalogued name still create false candidates when the title carries a parallel word that is also a product (for example "Prizm"); the rule order protects the outcome (they end unmatched), not the candidate list.
