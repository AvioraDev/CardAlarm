# CardAlarm architecture guide

Reviewed 2026-10-03 against source commit `09f44f230324467007bc70dbc61571b579386fd9` (reliability draft; main baseline `66bd0c3`). This guide records implemented behavior for architecture analysis, including incomplete foundations and unresolved deployment assumptions.

1. Read [System architecture](system-architecture.md) for component boundaries, routes and roles, data relationships, end-to-end flows, and reviewer questions.
2. Read [Build and runtime inventory](build-runtime-inventory.md) for manifests, dependency/configuration inventory, commands, build evidence, deployment artifacts, and operational prerequisites.
3. Read [Architecture review](architecture-review.md) for independently checked design risks, evidence limits and recommended verification.
4. Consult older topic documents only after checking their claims against the source. In particular, [Target scan engine pipeline](target-scan-engine-pipeline.md) describes a target architecture; [Local MVP rebuild](local-mvp-rebuild.md) and [Supabase migration](supabase-migration.md) describe earlier stages. [Auth and user isolation](auth-and-user-isolation.md), [DB-backed jobs](db-backed-scan-jobs-phase-1-2.md), and [Engine runtime](engine-runtime-supabase.md) also contain earlier-stage claims superseded by the current source.

The current documents complement each other: system architecture explains what the code does; the inventory explains how it is assembled and run; the review ranks risks and proposes acceptance tests. They do not prove the state of the hosted database, Auth settings, installed worker service, store endpoints, or email provider. No live systems or secrets were inspected for this review.

Historical topic references:

| Area | Earlier documentation |
| --- | --- |
| Identity and isolation | [Auth and user isolation](auth-and-user-isolation.md), [User watchlist CRUD](user-watchlist-crud.md), [Legacy admin watchlist isolation](legacy-admin-watchlist-isolation.md) |
| Scanning | [Admin scan operations](admin-scan-operations.md), [DB-backed jobs](db-backed-scan-jobs-phase-1-2.md), [Incremental configuration](incremental-scan-configuration.md), [Batch persistence](scanner-batch-product-persistence.md) |
| Inventory and matching | [Availability events](product-availability-events.md), [Checklist lookup performance](reference-checklist-matching-performance.md), [Watchlist backfill](watchlist-backfill.md) |
| Operations | [Engine runtime](engine-runtime-supabase.md), [Admin stores](admin-store-management.md), [Staging runbook](../staging-deployment-runbook.md) |

Source references in the current documents use repository-relative paths and one-based line numbers at the reviewed commit. Subsequent edits can move those lines.
