# DB-Backed Scan Jobs Phase 1/2

## Summary

CAR-28 begins the migration away from web-spawned scan processes.

Implemented in this phase:

- `public.scan_jobs` and `public.store_scan_jobs` queue tables.
- Engine helper functions for atomic job claim, heartbeat, stale recovery, and cancellation request.
- Admin scan action now enqueues a queued `scan_jobs` row and a compatible queued `scan_runs` projection.
- `engine/src/worker.ts` can claim one queued job and execute the existing scan internals as a compatibility bridge.
- Admin scan UI understands queued scan runs.

Not implemented in this phase:

- No long-running worker loop or scheduler.
- No per-store parallelism.
- No adaptive shallow scan behavior.
- No `page_fetch_tasks`.
- No removal of `scan_runs` or `store_scan_runs`.

## Compatibility

`scan_runs` remains the admin-facing compatibility projection. This keeps `/admin/scans` and `/api/scan-status` functional while the durable worker is built in follow-up phases.

The current scanner internals remain unchanged. OOS behavior is unchanged: missing products are only marked unavailable when the existing scan path reaches post-scan reconciliation without fetch errors or early-stop.

## Next Phase

Run one worker cycle locally with:

```bash
npm run worker:once
```

The next implementation should add a deployed loop/scheduler around this one-cycle worker and then fan out parent jobs into per-store jobs.
