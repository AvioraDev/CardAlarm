# Target Scan Engine Pipeline and Worker Model

## 1. Current Architecture Summary

CardAlarm currently has a functional MVP scanner, but the runtime shape is still a script-oriented flow rather than a durable ingestion system.

- `web/src/lib/actions.ts` starts scans by spawning `npx tsx engine/src/scan.ts` from a Next.js server action.
- `engine/src/scan.ts` creates a `scan_runs` row, loads active Shopify stores from `public.stores`, and calls `runIngestionCycle()`.
- `engine/src/ingest.ts` fetches Shopify pages, normalises products, upserts cache rows, classifies, matches, reconciles watchlists, enqueues alerts, and processes alerts in one broad execution path.
- `store_scan_runs` records useful per-store progress and timing metadata, but it is a progress table, not a durable claimable queue.
- CAR-25 has already removed the worst reference checklist matching hotspot by adding batched checklist loading and a page-level lookup cache.
- CAR-29 has already made alert delivery transaction-safe by introducing a `processing` alert status and atomic alert claiming.

This is acceptable for local MVP iteration, but not for reliable beta or production operation.

## 2. Current Failure Modes

- Web-triggered child processes can die without a durable job claim, worker identity, heartbeat, or retry state.
- Frontend polling timeout can mutate scan state even though polling timeout is not the same thing as worker failure.
- A slow or failing store can dominate the whole scan because parent and store work are tightly coupled.
- Store scans are only partially isolated; a store failure currently causes the parent run to fail after the store loop.
- Fetching, caching, classification, matching, reconciliation, and alert delivery are coupled in one call path.
- Alert delivery is still invoked from scan completion even though delivery should be independently retryable.
- Store identity is drifting because `store_products.source` has more source labels than configured `stores`; future code must prefer `store_id`.
- UI facet/read queries remain expensive because read-model preparation is not yet separated from ingestion.

## 3. Target Architecture Diagram

```text
admin/manual schedule
  -> scan_jobs queued
  -> worker claims parent scan_job
  -> creates store_scan_jobs for active stores
  -> store workers claim store_scan_jobs
  -> adaptive Shopify page fetch windows
  -> product normalisation
  -> batched source_products / store_products cache upsert
  -> product_snapshots only for changed products
  -> product_availability_events
  -> deterministic product_classifications
  -> product_card_matches
  -> watchlist_reconciliation
  -> alert_enqueue
  -> alert_delivery_worker
  -> scan_runs / store_scan_runs progress projections
```

The target system is still Postgres-first. Do not introduce a separate queue service until the DB-backed worker model has proven insufficient.

## 4. Proposed Database Schema Changes

### `scan_jobs`

Parent orchestration queue. This table owns worker claim state and should become the only thing manual admin scans and schedules enqueue.

Required fields:

- `id bigserial primary key`
- `mode text not null`: `watchlist`, `full`, or future `shallow`
- `status text not null`: `queued`, `running`, `completed`, `failed`, `cancelled`, `timed_out`
- `requested_by uuid null references auth.users(id)`
- `requested_by_kind text not null default 'admin'`: `admin`, `schedule`, `system`
- `priority integer not null default 100`
- `locked_by text null`
- `locked_at timestamptz null`
- `heartbeat_at timestamptz null`
- `attempts integer not null default 0`
- `max_attempts integer not null default 3`
- `next_attempt_at timestamptz not null default now()`
- `started_at timestamptz null`
- `completed_at timestamptz null`
- `cancel_requested_at timestamptz null`
- `cancel_requested_by uuid null references auth.users(id)`
- `processed integer not null default 0`
- `matched integer not null default 0`
- `failed_stores integer not null default 0`
- `completed_stores integer not null default 0`
- `error text null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- Claim index on `(status, next_attempt_at, priority, created_at)` where status is `queued` or retryable.
- Running heartbeat index on `(heartbeat_at)` where status is `running`.
- Recent admin index on `(created_at desc)`.

### `store_scan_jobs`

Per-store claimable queue. A parent `scan_job` fans out into one row per active Shopify store.

Required fields:

- `id bigserial primary key`
- `scan_job_id bigint not null references public.scan_jobs(id) on delete cascade`
- `store_id bigint null references public.stores(id) on delete set null`
- `store_slug text not null`
- `store_name text not null`
- `base_url text not null`
- `scan_mode text not null`
- `scan_strategy text not null`: `shallow`, `incremental`, `full`
- `early_stop_enabled boolean not null`
- `early_stop_unchanged_pages integer not null`
- `page_concurrency integer not null default 1`
- `status text not null`: `queued`, `running`, `completed`, `failed`, `cancelled`, `timed_out`
- `locked_by text null`
- `locked_at timestamptz null`
- `heartbeat_at timestamptz null`
- `attempts integer not null default 0`
- `max_attempts integer not null default 3`
- `next_attempt_at timestamptz not null default now()`
- `started_at timestamptz null`
- `completed_at timestamptz null`
- `products_seen integer not null default 0`
- `products_processed integer not null default 0`
- `products_matched integer not null default 0`
- `products_marked_unavailable integer not null default 0`
- `pages_fetched integer not null default 0`
- `last_page_fetched integer null`
- `stop_reason text null`
- `error_message text null`
- `metadata jsonb not null default '{}'::jsonb`
- timestamps

Indexes mirror `scan_jobs`, plus `(scan_job_id, status)` and `(store_id, created_at desc)`.

### `engine_workers`

Optional lightweight registry for observability and stale-worker diagnosis. It is not required for the first schema PR but should be added when multiple workers are deployed.

Fields: `worker_id`, `worker_type`, `hostname`, `version`, `started_at`, `heartbeat_at`, `current_job_id`, `current_store_job_id`, `metadata`.

### `page_fetch_tasks`

Defer this table. Page-level work can initially live in `store_scan_jobs.metadata`. Add `page_fetch_tasks` only if page retries and page-level parallelism need independent persistence.

## 5. Parent Scan Job Lifecycle

State transitions:

```text
queued -> running -> completed
queued -> running -> failed
queued -> running -> timed_out
queued -> cancelled
running -> cancelled
running -> timed_out -> queued
running -> timed_out -> failed
```

Rules:

- Manual admin scans and scheduled scans both insert `scan_jobs`.
- A parent worker claims exactly one queued parent job at a time.
- Claiming must be atomic:

```sql
with next_job as (
  select id
  from public.scan_jobs
  where status = 'queued'
    and next_attempt_at <= now()
  order by priority asc, created_at asc
  limit 1
  for update skip locked
)
update public.scan_jobs sj
set status = 'running',
    locked_by = $1,
    locked_at = now(),
    heartbeat_at = now(),
    started_at = coalesce(started_at, now()),
    attempts = attempts + 1
from next_job
where sj.id = next_job.id
returning sj.*;
```

- The parent worker snapshots active stores into `store_scan_jobs`, then either processes store jobs directly in v1 or lets store workers claim them.
- Parent status is aggregated from store jobs.
- One store failure does not automatically fail the parent. The parent is `completed` with `failed_stores > 0` when at least one store completed and failures are non-fatal. It is `failed` only when all required store jobs fail or the parent orchestration itself fails.
- Parent `scan_runs` rows remain a read/progress projection for the admin UI until the UI migrates fully to `scan_jobs`.

## 6. Store Scan Job Lifecycle

State transitions mirror parent jobs:

```text
queued -> running -> completed
queued -> running -> failed
queued -> running -> timed_out
queued -> cancelled
running -> cancelled
running -> timed_out -> queued
running -> timed_out -> failed
```

Rules:

- Store jobs own source-specific runtime configuration as a snapshot. A later store config edit must not mutate an already queued job.
- Store jobs heartbeat after each page window and before/after each heavy stage.
- Store job progress includes pages fetched, last page fetched, stop reason, products seen, processed, matched, marked unavailable, timing durations, and current phase.
- Store jobs update `store_scan_runs` as a projection so `/admin/scans` remains compatible during migration.
- `stores.last_successful_scan_at` updates only when a store job completes successfully.
- `stores.last_failed_scan_at` updates when a store job fails or times out.

## 7. Worker Claim, Heartbeat, Stale Recovery, and Cancellation

### Claiming

Use the same pattern for `scan_jobs`, `store_scan_jobs`, and alert delivery:

- Select candidate rows with `FOR UPDATE SKIP LOCKED`.
- Immediately update the row to `running` or `processing`.
- Return the claimed row from the update statement.
- Never perform external work while relying only on an uncommitted select lock.

### Heartbeat

Workers update `heartbeat_at = now()` at safe boundaries:

- after claiming a parent job
- after store fan-out
- before and after each page fetch window
- after cache upsert
- after classification
- after matching
- after OOS reconciliation
- after alert enqueue

Heartbeat threshold defaults:

- parent job stale after 10 minutes without heartbeat
- store job stale after 10 minutes without heartbeat
- alert processing stale after 15 minutes, matching CAR-29

### Stale Recovery

Recovery is a periodic worker task:

- If `status = running` and `heartbeat_at` is stale and `attempts < max_attempts`, mark `timed_out`, clear lock fields, set `status = queued`, and set `next_attempt_at`.
- If attempts are exhausted, mark `failed` with an explicit timeout error.
- If the worker might have completed external work after the last heartbeat, idempotent writes and dedupe keys must make retry safe.

### Cancellation

Cancellation is cooperative:

- Admin sets `cancel_requested_at` and optional `cancel_requested_by`.
- Workers check cancellation between stages and page windows.
- A cancelled parent should cancel queued child store jobs.
- A running store job should finish the current database transaction, skip further page fetches, and finalize as `cancelled`.
- Cancellation must never mark products OOS.

## 8. Shallow vs Full Scan Rules

Scan strategies:

- `shallow`: front-page freshness check for frequent scans.
- `incremental`: current default, scans with early-stop on unchanged full pages.
- `full`: scans until the Shopify feed ends, unless a fetch error occurs.

OOS marking is allowed only when all are true:

- scan strategy is `full`
- source fetch reached a terminal `empty_page` or `partial_page`
- no page fetch returned an error
- scan was not cancelled
- scan did not stop early
- store job completed successfully

OOS marking is forbidden for:

- `shallow` scans
- `incremental` scans that stop early
- fetch-error scans
- cancelled scans
- timed-out scans
- manually interrupted scans

This preserves the existing safety rule from incremental scanning and makes it explicit for future workers.

## 9. Page Fetch Strategy and Adaptive Concurrency

Initial worker implementation:

- Keep existing Shopify `/products.json?limit=100&page=N`.
- Keep `CARDALARM_PAGE_CONCURRENCY`, clamped between 1 and 5.
- Store-level config may override page concurrency later.
- Fetch page windows concurrently.
- Preserve rate-limit discipline with delay/backoff between windows.

Adaptive behavior:

- Start at concurrency 1 or store-configured value.
- Increase gradually for fast successful stores up to 5.
- Reduce concurrency on timeout, 429, 5xx, or repeated slow pages.
- Record per-window metrics in `store_scan_jobs.metadata`.
- Stop shallow scans after configured page limit.
- Stop incremental scans after configured unchanged page threshold.
- Stop full scans only at terminal feed end or unrecoverable fetch error.

Recommended stop reasons:

- `empty_page`
- `partial_page`
- `early_stop`
- `shallow_limit`
- `fetch_error`
- `cancelled`
- `timed_out`

## 10. Pipeline Stage Ownership and Data Flow

### Fetch pages

Reads `store_scan_jobs` source snapshot. Writes page metrics and raw Shopify payloads in memory for the next stage.

### Product normalisation

Converts Shopify product JSON into `SourceProductCacheInput`. This stage should stay pure and testable.

### Cache upsert

Writes `source_products`, `store_products`, `product_snapshots`, `product_availability_events`, and deterministic `product_classifications`.

Rules:

- keep writes batched
- preserve raw latest payload
- create snapshots only when product content changes
- prefer `store_id` for canonical identity
- keep `source` as compatibility/source-label data

### Product classification

Classifies every active/current product seen in a scan page, even if it does not match a watchlist. Deterministic classification remains separate from user watchlist matching.

### Product-card matching

Runs only for new, changed, or match-context-changed products. Uses preloaded watchlist/player/checklist context. CAR-25 checklist caching remains the baseline: do not reintroduce per-product checklist DB lookups.

### Watchlist reconciliation

Runs after store jobs or parent completion depending on the migration phase. It writes `watchlist_matches` from canonical `store_products` and `product_card_matches`.

### Alert enqueue

Creates deduped `alerts` records after watchlist matches are created or promoted.

### Alert delivery

Runs in a separate alert worker. It claims pending alerts atomically using the CAR-29 `processing` status and never depends on a scan worker staying alive.

## 11. Matching, Classification, and Reconciliation Boundaries

- Scanning answers: what products exist and what changed?
- Classification answers: what does this product appear to be?
- Product-card matching answers: what catalogue card does this product likely represent?
- Watchlist reconciliation answers: which users care about this product?
- Alerts answer: which user-visible events need notification?

Do not collapse these stages back into one model. The current code may execute them in one process initially, but the functions should be split so future workers can own separate stages.

## 12. Alert Enqueue and Delivery Boundaries

Scanning should enqueue alert candidates, not deliver email.

Target flow:

```text
watchlist_matches inserted/promoted
  -> alert_enqueue inserts pending/suppressed alerts with dedupe_key
  -> alert_delivery_worker claims pending/failed alerts
  -> send provider email or log-mode email
  -> mark sent/failed
```

Rules:

- Dedupe key remains authoritative: `new_watchlist_match:email:{user_id}:{watchlist_id}:{store_product_id}`.
- Disabled watchlists create or keep `suppressed` alerts.
- Enabling notifications may promote `suppressed` to `pending`.
- Concurrent alert workers cannot send the same row because CAR-29 uses `status = processing` via atomic claim.

## 13. Observability and Metrics

Every parent scan job should record:

- status, mode, requested_by, requested_by_kind
- worker id, lock time, heartbeat time
- total stores, completed stores, failed stores
- processed, matched, products marked unavailable
- total duration
- final error if failed

Every store job should record:

- status, phase, worker id
- store id, slug, source snapshot
- scan strategy, early stop config, page concurrency
- pages fetched, last page fetched, stop reason
- products seen, processed, matched, marked unavailable
- fetch, cache, classification, match, reconciliation, alert enqueue, post-scan durations
- rate-limit/HTTP error metadata

Page-level metrics should initially be compact JSON in `store_scan_jobs.metadata`. Add `page_fetch_tasks` only if page retry and page-level observability become hard to operate without first-class rows.

## 14. Backward Compatibility With Current Tables

`scan_runs` and `store_scan_runs` should be retained during migration.

Compatibility plan:

- Phase 1 adds new queue tables without changing current scanner behavior.
- Phase 2 web action inserts `scan_jobs` and creates/updates `scan_runs` as an admin-facing projection.
- Phase 3 store workers create/update `store_scan_runs` as projections from `store_scan_jobs`.
- Admin UI keeps reading `scan_runs` and `store_scan_runs` until the job UI is ready.
- Once the job UI is stable, `scan_runs` may become a compatibility view or be deprecated behind a migration plan.

Do not drop existing scan tables in the worker migration.

## 15. Incremental PR Sequence

### Phase 1 — Job schema and claim helpers

- Add `scan_jobs` and `store_scan_jobs`.
- Add claim helpers using `FOR UPDATE SKIP LOCKED`.
- Add heartbeat and stale-job recovery helpers.
- Add tests for duplicate workers, stale recovery, cancellation flags, and retry bounds.
- Keep current `engine/src/scan.ts` and `runIngestionCycle()` behavior unchanged.

### Phase 2 — Web action becomes enqueue-only

- Replace detached process spawning in `web/src/lib/actions.ts`.
- Admin scan action inserts a `scan_jobs` row.
- UI reads job/projection state.
- Scheduled scans use the same insert path as manual scans.

### Phase 3 — Worker entrypoint

- Add `engine/src/worker.ts`.
- Worker claims parent jobs and initially executes the existing scan internals.
- Add heartbeat during parent execution.
- Keep current `scan_runs` projection updates.

### Phase 4 — Per-store job fan-out

- Parent job snapshots active stores into `store_scan_jobs`.
- Store workers claim store jobs independently.
- Store job completion updates parent aggregate status.
- One store failure no longer poisons successful store jobs.

### Phase 5 — Shallow/full scan modes

- Add explicit shallow scan configuration.
- Shallow scans check front pages only.
- Full scans remain responsible for OOS marking.
- Incremental scans keep early-stop behavior and never mark OOS when early-stopped.

### Phase 6 — Pipeline optimisation

- Split current monolithic `processSource()` into stage functions.
- Keep batched source/store product persistence.
- Keep CAR-25 checklist cache.
- Preload watchlist/player/checklist context once per store job.
- Prepare explicit handoff points for future classification and matching workers.

### Phase 7 — Alert worker isolation

- Keep scan workers responsible for alert enqueue only.
- Add a dedicated alert worker loop around CAR-29 claim functions.
- Add concurrency tests for multiple alert workers.

### Phase 8 — Read model preparation

- Measure admin inventory and For You filter query costs after worker migration.
- Add `inventory_search_documents` only if indexes and current classification joins are still insufficient.
- Treat it as a projection maintained by product cache/classification changes, not as a source of truth.

## 16. Risks and Trade-Offs

- DB-backed queues are simpler and sufficient for MVP, but they require careful indexes and heartbeat recovery.
- Exactly-once external side effects are not realistic; use idempotent DB writes and dedupe keys to make retries safe.
- Keeping projections and job tables in parallel adds temporary complexity but avoids breaking admin scan UI.
- Per-store parallelism can increase load on Shopify stores; concurrency must remain capped and adaptive.
- Shallow scans improve freshness but cannot prove absence; they must never mark missing products unavailable.
- Source/store identity drift will remain until legacy source labels are audited and backfilled to `store_id`.

## 17. Test Plan

Schema and helper tests:

- `scan_jobs` claim returns one job for concurrent workers.
- `store_scan_jobs` claim returns different store jobs for concurrent workers.
- Stale running jobs retry when attempts remain.
- Stale running jobs fail when attempts are exhausted.
- Cancellation request is visible to running workers.

Worker lifecycle tests:

- Admin enqueue creates a queued parent job.
- Parent worker creates store jobs from active stores.
- Store worker updates heartbeat and progress.
- One failed store plus one completed store yields parent completed-with-failures metadata.
- All stores failed yields parent failed.

Scan safety tests:

- Full complete scan may mark OOS.
- Shallow scan never marks OOS.
- Early-stopped incremental scan never marks OOS.
- Fetch-error scan never marks OOS.
- Cancelled/timed-out scan never marks OOS.

Alert tests:

- Scan reconciliation enqueues alerts only.
- Alert worker delivery uses CAR-29 atomic claim.
- Concurrent alert workers do not double-send.

Regression commands:

```bash
npm test -- --runInBand
npx tsc --noEmit
npm run lint --prefix web
npm run web:build
```

## Related Issues

- CAR-28: DB-backed scan job worker and removal of web-spawned engine process.
- CAR-30: adaptive shallow-scan requirements.
- CAR-25: reference checklist matching hotspot removal.
- CAR-29: transaction-safe alert processing.
