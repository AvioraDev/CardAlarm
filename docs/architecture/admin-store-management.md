# Admin Store Management

## Implementation Log

- Added `/admin/stores` as the admin-only store management surface for `public.stores`.
- Added create and edit forms for Shopify store records, including slug normalization, basic URL validation, scan-frequency bounds, country, currency, and active scan eligibility.
- Added activate/deactivate controls so admins can exclude a store from future manual scans without deleting scan history or cached inventory.
- Linked store management from the admin navigation and the existing admin operations page.

## Operational Notes

- Active Shopify stores in `public.stores` remain the scanner source of truth.
- `sources.json` remains a local fallback and seed source only.
- `sources.json` fallback is disabled by default and only runs when `CARDALARM_ALLOW_SOURCES_JSON_FALLBACK=true`.
- If no active database stores are configured, manual scans fail with an instruction to add or activate stores under `/admin/stores`.
- To add a store manually, sign in as an admin, open `/admin/stores`, choose **New Store**, enter a Shopify base URL, and keep **Active for scans** checked.
- To disable scanning for a store, open `/admin/stores` and use **Deactivate** or edit the store and untick **Active for scans**.

## Follow-Up Debt

- Store delete/archive policy is intentionally deferred; deactivate is safer for MVP history preservation.
- Scheduled scanning is intentionally deferred until scan orchestration is introduced.
- Store-level scan status currently depends on scanner persistence updating `last_successful_scan_at` and `last_failed_scan_at`.
