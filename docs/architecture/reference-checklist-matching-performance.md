# Reference Checklist Matching Performance

## Context

CAR-25 identified the reference checklist lookup as a scan-time database hotspot:

- Query shape: `select * from reference_checklists where card_number = $1 and set_name ilike $2 limit $3`
- Observed calls: 10,419
- Observed cumulative time: approximately 237 seconds
- Observed average time: approximately 22.8ms
- Observed returned rows: 3 total

The issue was not only index coverage. The scanner was able to call checklist lookups per candidate product, which made a low-yield lookup dominate scan runtime.

## Change

The scan loop now batches reference checklist loading by card number at page scope:

1. Products are cached as before.
2. Products marked `shouldMatch` have card numbers extracted.
3. Missing card numbers are loaded with one `card_number = any($1::text[])` query.
4. Matcher set-context and broad card-number resolution use the in-memory `ChecklistLookupCache`.

Single-listing helpers still retain DB fallback behaviour, but normal store scans no longer perform one reference checklist query per candidate product.

## Database Support

Migration `20260513007000_reference_checklist_lookup_indexes.sql` adds:

- `reference_checklists(card_number)`
- `reference_checklists(card_number, set_name)`
- `pg_trgm`
- GIN trigram index on `set_name`

## Expected Result

For scanner execution, the previous per-product checklist query count is eliminated. Checklist reads are bounded by page-level batches and only fetch rows for card numbers seen in products that actually need matching.
