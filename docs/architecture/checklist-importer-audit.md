# Checklist importer audit and fix proposal (CAR-77)

Status: **audit complete, fix proposed, not implemented.** Date: 2026-10-12.
Tool: `engine/src/catalogue/audit-importer.ts` (read-only). Per-workbook results: `docs/accuracy/importer-audit-001.csv`.

The importer (`engine/src/catalogue/checklist-parser.ts`, `import-checklists.ts`) turns Beckett-format workbooks into `checklist_products` -> `checklist_subsets` -> `checklist_cards` / `checklist_parallels`. The matcher depends on the distinction between a subset (insert), a parallel and a card. This audit checks how well the catalogue preserves it.

## 1. Method

For each of the 58 workbooks in `docs/sets` and `docs/sets/incoming`:

1. **Parse** with the importer's own code and compare with the catalogue: 57 of 57 imported products match a fresh parse exactly (subset, card and parallel counts). The catalogue is faithful to the parser, so every defect below is in the parser, not in the data load. (One workbook, a duplicate `Silhouette ... (1).xlsx`, is intentionally not imported separately.)
2. **Count card rows in the source sheets** independently (a short card number followed by a name) and compare with parsed cards.
3. **Find block headers** in the source: single-cell rows such as `Crusade - #516-545` that are not followed by an "N cards" row.
4. **Compare the Master sheet** with parsed subsets and parallels (order-insensitive). Treat this as an upper bound only, because Master labels vary by product and include carried-over names.

## 2. Findings

| # | Finding | Scale |
|---|---|---|
| 1 | **A whole Base sheet is dropped.** 2020-21 Donruss Optic has no base subset in the catalogue: the sheet begins "Base Set" then "Parallels:" with no "N cards" row, so the parser never opens a subset and discards the 200 base cards that follow. These include every Rated Rookie (for example #167 Aleksej Pokusevski, fixture 14). | 1 workbook, **200 cards**; 122 existing classifications point at that product |
| 2 | **Base-set blocks are flattened into one "Base Set".** Workbooks declare blocks such as `Crusade - #516-545`, `Rookies and Stars - #651-675`, `Rated Rookies - #201-250`. The parser treats these single-cell rows as notes and drops them, so block membership and each block's own parallels are lost. | **32 of 58 workbooks**. The three Chronicles products have 26 to 27 blocks each. Others: Mosaic (4-6), Select (3-4), Flux (5), Court Kings (4), Hoops (1-3), Donruss / Optic / Elite (1-2) |
| 3 | **Rookie status is lost.** In these checklists a rookie is identified by block membership ("Rated Rookies", "Rookies and Stars") or by an `RR` / `RC` flag in the Teams sheet. The parser ignores the Teams sheet and the blocks, so `is_rookie` is true for 705 of 63,336 cards. | catalogue-wide |
| 4 | **Block-specific parallels are attached to the whole base set.** The Master sheet lists parallels per block (for example `Base All-Time Greats Mosaic Black` in 2020-21 Mosaic, `Base Set - Concourse - Black Disco Prizms` in 2023-24 Select). The catalogue has one parallel list for the base set. | Master labels with no parsed counterpart: 3,980 of 10,664 (upper bound; see method note) |
| 5 | **No loud failure.** Nothing compares source card rows with parsed cards or declared counts with parsed counts, so finding 1 passed silently. | all imports |

Row-level card loss is otherwise small: source card rows 65,603; parsed 66,755 (the parser also counts rows the simple row check does not). Apart from finding 1, no workbook lost card rows. **The loss is structural (blocks, rookies, per-block parallels), not missing rows.**

Impact on live data: **2,618 of the 4,343 classifications that resolve to a catalogue product (60%) point at one of the 32 affected products.**

## 3. Question 9: "International Red Stars /125"

The source says this is a **parallel of the base set**, not an insert. In `2024-25-Donruss-Basketball-Checklist.xlsx`:

- Sheet `Base`, row 29: `International Red Stars - /125`, in the Base Set's parallel list (alongside `International`, `International Holo Maroon Laser`, `International Blue Fireworks - /85`, `International Green Scope - /5`).
- Sheet `Master`: base cards appear as `Base International ...` labels.
- Separately, sheet `Inserts` lists `International Blue Stars - /99` and `International Red Fireworks - /55` as parallels of *insert* subsets. That is a different set of parallels with similar words.

The importer did **not** turn an "International Stars" insert into a parallel; there is no such insert in the file. The catalogue is correct for fixture 9, and the brief's "International Stars insert" is not supported by the source.

## 4. Proposed fix

### 4.1 Parser (no schema change)

1. **Open a subset on a header followed by an "N cards" row, a "Parallels" header, or a card row.** The count row becomes optional. Fixes finding 1.
2. **Read block headers** matching `Name - #from-to` into a list of blocks for the sheet.
3. **Assign each card to its block by card number**, and each block's parallels from the block's own list where the sheet gives one.
4. **Read the Teams sheet** for `RC` / `RR` flags and set `is_rookie` from it, and from block names containing "Rookie".
5. **Validate every import and fail loudly:** source card rows must equal parsed cards; declared card counts must equal parsed counts per subset; any single-cell row that is neither a header, a count, a parallel nor a block header is listed. `--force` must still pass validation.

### 4.2 Schema (additive migration, no existing row changes)

```sql
alter table public.checklist_subsets
  add column if not exists parent_subset_id bigint references public.checklist_subsets(id) on delete cascade,
  add column if not exists number_from text,
  add column if not exists number_to text;
create index if not exists idx_checklist_subsets_parent on public.checklist_subsets (parent_subset_id);
```

A block (`Crusade #516-545`) becomes a subset of `kind = 'base'` whose `parent_subset_id` is the base set. Cards attach to the block. Parallels attach to the block when the sheet lists them for the block, otherwise they are inherited from the parent. `CatalogueIndex.parallelsFor` already inherits a base subset's parallels, so the matcher change is small. Fixture 17 would then resolve to subset "Crusade" with its own parallels.

### 4.3 Re-import plan

The importer replaces a product as a unit. Foreign keys from `product_classifications` to `checklist_*` are `ON DELETE SET NULL`, so a re-import detaches existing classifications until they are reclassified.

1. Apply the additive migration (safe, no behaviour change).
2. Implement and test the parser fixes; the audit tool must show **zero card rows lost and zero undeclared block headers** on all 58 workbooks before any import.
3. For each affected product: record the ids of classifications pointing at it, re-import it, then reclassify exactly those listings (the existing pending / `--missing-product` flows).
4. Order: 2020-21 Donruss Optic first (restores 200 base cards), then the three Chronicles products, then the other 29.
5. Verify after each product: catalogue cards equal source card rows; the audit CSV shows no remaining flags.

### 4.4 Effect on existing matches

- `watchlist_matches` are **not tied to the catalogue** and are unaffected.
- Customer-visible output is unaffected while readers use only deterministic classifications (D-001 shadow).
- Jev classifications for affected products lose their `checklist_*` ids until reclassified: **up to 2,618 listings**. Under the CAR-78 acceptance rule these are not accepted without a card row, so **the re-import and reclassification must complete before readers are ever switched to Jev**.
- Reclassification needs Jev calls for the affected listings (roughly 2 to 3 requests each); this is the cost to budget.

## 5. Not verified

- Whether every block header is correctly recognised by the pattern in `audit-importer.ts` (it matches `Name - #a-b`; other layouts may exist).
- The Master comparison is noisy and is reported only as an upper bound.
- Rookie semantics per product (for example whether "Rated Rookies" in every product means rookie) were not checked against each manufacturer's definition.
