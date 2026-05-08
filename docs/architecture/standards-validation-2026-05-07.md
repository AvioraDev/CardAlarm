# CardAlarm Standards Validation — 2026-05-07

## Context

This review validates the current Supabase-backed MVP build against `docs/ai/cardalarm-master-context.md`.

The master context is explicit that CardAlarm must be fast, accurate, testable, scalable enough beyond MVP, and built using conventional framework and database practices. It also defines three non-negotiable architectural separations:

1. Scanning answers: what products exist.
2. Catalogue matching answers: what card a product probably represents.
3. Watchlist matching answers: which users care about that product.

## Current Standard

The current implementation is a working transition from the original proof of concept, not yet the final best-practice MVP architecture.

The foundation is directionally correct:

- Supabase Postgres is now the development database.
- Auth and user-owned watchlists exist.
- RLS policies exist for user-owned data.
- Cached product, snapshot, product match, and watchlist match tables exist.
- The dashboard now defaults toward user watchlist matches.
- Admin can manually trigger and observe scans.
- Core TypeScript, lint, build, and test commands have passed during this migration.

However, several implementation paths are still compatibility-driven. They should not be treated as production-quality or beta-ready until corrected.

## Standards Met

### Database Foundation

- Core MVP tables exist in Supabase migrations.
- Important indexes exist for store products, snapshots, product matches, and watchlist matches.
- User-owned tables have RLS policies.
- Secrets are expected through environment variables, not client code.

### Product Direction

- The application now reflects the intended user model: users create watchlists and view matched cached inventory.
- The dashboard split aligns with the product expectation that the default view is user-specific matches, with a separate browse-all mode.
- Watchlist backfill exists and runs after watchlist creation/reactivation/manual refresh.

### Development Practice

- Runtime database access has moved away from SQLite.
- Logic-heavy engine tests still exist.
- Migration and architecture work has been documented across `/docs/architecture`.

## Standards Not Yet Met

### 1. Scanner Persistence Is Too Slow

`engine/src/db.ts` currently performs row-by-row writes inside `upsertSourceProducts`.

For each product, it writes:

- `source_products`
- `store_products`
- optionally `product_snapshots`

This is not acceptable against remote Supabase at scale. It creates excessive network round trips and is the likely root cause of scans appearing to hang on page one.

Required standard:

- Use batched insert/upsert operations.
- Insert snapshots in batches.
- Return status rows from set-based queries.
- Avoid per-product `select id` lookups where a set-based `returning` or join can be used.

### 2. `listings_feed` Is Still Acting As A Compatibility Read Model

The master context says CardAlarm must cache all scanned inventory, not only matched listings.

Current problem:

- Dashboard browse-all has been moved to canonical `store_products`.
- Watchlist dashboard has been moved to `watchlist_matches` joined to canonical `store_products`.
- Watchlist backfill starts from `listings_feed`.

Remaining backfill and engine compatibility dependencies are not correct as the long-term MVP standard because `listings_feed` is a compatibility table for previously matched feed rows. It is not the full cached inventory.

Required standard:

- `store_products` must become the canonical inventory table.
- `product_snapshots` must be the canonical historical record.
- `product_card_matches` must be the canonical product-to-card match table.
- `watchlist_matches` must link user watchlists to `store_products` and optional `product_card_matches`.
- `listings_feed` should be retained only as a temporary compatibility/admin view, then removed or replaced by a SQL view.

### 3. Scanning, Catalogue Matching, And Watchlist Matching Are Still Coupled

The engine still uses active watchlist context when deciding matching work.

This violates the master-context separation:

- Scanning should cache products independent of users.
- Catalogue matching should classify products independent of users.
- Watchlist matching should run after catalogue matching and be user-specific.

Required standard:

- Scan all configured stores into `store_products`.
- Run catalogue matching against changed/new active products.
- Persist confidence-scored `product_card_matches`.
- Run watchlist backfill/matching as a separate step.

### 4. Manual Scan Trigger Is Local-MVP Only

The web app starts scans by spawning `npx tsx engine/src/scan.ts` from a Next server action.

This is acceptable only for local development. It is not a reliable production or beta background-job architecture.

Required standard before beta:

- Move scan execution to a proper job runner such as Inngest, Trigger.dev, Supabase Edge Functions, or a deployed worker.
- Keep the UI trigger as a job enqueue action, not a process spawner.
- Track job state in `store_scan_runs` and/or a scan orchestration table.

### 5. Scan Status Uses Legacy `scan_runs`

`store_scan_runs` exists but is not yet the primary operational model.

Required standard:

- Use `store_scan_runs` for per-store status, product counts, failure messages, and completion times.
- Keep aggregate scan orchestration separately if needed.
- Admin UI should expose per-store scan status, not only a single global scan row.

### 6. User Isolation Needs Continued Audit

RLS policies exist, and user-owned watchlists are scoped. However, server-side direct Postgres access bypasses Supabase RLS because it uses database credentials.

This is not automatically wrong, but it raises the engineering standard:

- Every direct SQL query touching user-owned data must explicitly scope by `user_id`.
- User mutations should continue to prefer authenticated Supabase clients where practical.
- Admin direct SQL must always call `requireAdmin`.

### 7. Matching Accuracy Is Not Yet MVP-Grade

The app has improved confidence/reason fields, but catalogue matching still needs a stronger rules-first implementation around:

- player aliases
- set aliases
- card number extraction
- serial extraction
- parallel detection
- conflict detection
- low-confidence suppression

Required standard:

- A bad match is worse than no match.
- Possible matches must be visually and semantically separated.
- Matching tests must cover known messy titles and previously mislabelled cases.

### 8. Tests Are Incomplete For New MVP Paths

Current tests cover older engine/matching behavior, but the new Supabase MVP paths need more coverage.

Required tests:

- Watchlist backfill from cached inventory.
- Duplicate prevention in `watchlist_matches`.
- User ownership isolation.
- Dashboard query behavior for current versus possible matches.
- Scanner batch persistence once implemented.

### 9. Generated Database Types Are Not Complete Enough

The current type layer still has incomplete table typing in places.

Required standard:

- Generate full Supabase TypeScript types.
- Use typed rows for user-facing queries and mutations.
- Avoid broad `Record<string, unknown>` on core tables.

## Required Remediation Order

Do not keep patching scanner symptoms. The correct next build phase is:

1. Make `store_products` the canonical inventory source for browse-all, backfill, and dashboard joins.
2. Rewrite scanner persistence to batch upsert products and snapshots.
3. Move scan status to `store_scan_runs` with per-store progress.
4. Decouple catalogue matching from watchlist matching.
5. Rebuild watchlist backfill to evaluate `store_products` plus `product_card_matches`.
6. Update dashboard queries to render from `watchlist_matches` joined to canonical inventory.
7. Add tests for backfill, dedupe, isolation, and scanner persistence.
8. Keep `listings_feed` only as a temporary compatibility table until the UI no longer depends on it.

## Decision

The current build should be considered a functional bridge, not a standards-complete MVP.

The next implementation should focus on canonical inventory and batched scanner persistence. That addresses the slow scan, the stale/partial cache problem, and the misalignment between daily scans and user watchlists at the root.
