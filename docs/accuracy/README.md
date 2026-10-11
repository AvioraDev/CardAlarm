# Classifier accuracy set (CAR-63)

A hand-labelled sample of live listings, used to score the deterministic classifier and Jev (D-001). Jev stays in shadow until it beats the deterministic classifier here.

## Files

| File | What |
|---|---|
| `sample-001.csv` | Blind sample: listing text, price, photo link, and empty label columns. No classifier output, so labelling is not anchored on a prediction. |
| `engine/src/accuracy/export-sample.ts` | Makes a sample. Never overwrites an existing file. |
| `engine/src/accuracy/score.ts` | Scores both classifiers against the labelled rows. |

The sample is spread evenly across the active stores. About 10% are listings neither classifier calls a basketball single, which checks what the gate misses (sealed boxes, other sports, lots).

## How to label

Open `sample-001.csv` in a spreadsheet. Use the `title`, `description` and `image_url` / `product_url` to decide each value. Fill in **every** column for a row; a row with `item_type` left blank is treated as unlabelled and skipped, so you can label in several sittings.

| Column | What to enter |
|---|---|
| `item_type` | `single_card`, `sealed`, `lot`, `memorabilia` or `other`. Only `single_card` rows are scored on the fields below. |
| `sport` | `basketball`, or the other sport (`baseball`, `soccer`, `pokemon`, ...). |
| `year` | Season, e.g. `2023-24`. |
| `product_line` | The product, e.g. `Prizm`, `Select`, `Donruss Optic`. Leave off brand words like "Panini". |
| `player` | Full name as printed. |
| `card_number` | The card number, e.g. `275`. Leave blank if the listing really does not say. |
| `parallel` | The parallel, e.g. `Silver`, `Green Wave`. **Leave blank, or write `base`, for a base card.** |
| `is_rookie` | `yes` for a rookie card, else blank. |
| `is_auto` | `yes` for an autograph, else blank. |
| `serial_limit` | The print run: `99` for `/99`. Blank if not numbered. |
| `notes` | Anything odd, and especially **why** if the listing text alone could not tell you (for example "parallel only visible in the photo"). |

Rules of thumb:
- Label what the card **is**, using the photo and the text. If the title and the photo disagree, say so in `notes`.
- If you genuinely cannot tell a field, leave it blank and add a note. A blank counts as "not there" when scoring, so only leave a field blank when that is true or unknowable.
- Do not look at the classifier output while labelling.

## Scoring

```
npx tsx --env-file=web/.env.local engine/src/accuracy/score.ts docs/accuracy/sample-001.csv --write docs/accuracy/report-001.md
```

For each classifier the report gives, per field (player, year, product line, card number, parallel, serial limit, rookie, auto):

- **Precision**: when the classifier says something, how often it is right. This is the figure that matters most, because a wrong match is worse than a missing one.
- **Recall**: how much of what is really there it found.

It also gives an **identity** score (player + year + product line + card number + parallel all right). Identity precision is measured over the listings where the classifier committed to a player, card number and product line, and is the figure the v1.0 bar maps to (at least 95% precision on Current matches). Listings a classifier has no row for (for example Jev has not run on them) are counted separately, not scored wrong.

Matching is forgiving about formatting: case, accents, `#` and leading zeros in card numbers, brand words like "Panini", and a parallel named more fully ("Silver" vs "Silver Prizm"). It is strict about substance.

## Limits to keep in mind

- A parallel the classifier could not identify is stored as empty, which scores the same as "base". Base cards the classifier gets right and parallels it fails to identify look alike in the parallel precision figure; read parallel recall alongside it.
- 300 listings gives a rough estimate, not a precise one. A field with few labelled values (for example serial limit) has a wide margin.
- Re-export with another `--seed` for a fresh sample; do not edit labelled rows in place after scoring.
