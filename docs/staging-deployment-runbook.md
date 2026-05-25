# CardAlarm Staging Deployment Runbook

## Purpose

Use hosted staging to separate local-development slowness from real application bottlenecks. Staging should run the same queued scan model as the app: the web admin enqueues a scan job, a separate worker claims it, and `/admin/scan-qa` shows progress from database-backed scan tables.

## Recommended Topology

- **Web app:** hosted Next.js app from `web/`, deployed as a normal server-rendered application.
- **Database and auth:** hosted Supabase project with the repository migrations applied.
- **Worker:** hosted Node process or repeatable scheduled job from the repository root.
- **Scanner queue:** existing Postgres-backed `scan_jobs` and `scan_runs` tables. Do not add another queue provider for staging.
- **Admin visibility:** `/admin/scans` starts scans, `/admin/scan-qa` observes the current scan job, per-store runs, and recent match evidence.
- **Email:** keep `CARDALARM_EMAIL_MODE=log` unless a real sender is intentionally configured.

This topology intentionally keeps the scanner out of the web runtime. The web app enqueues work only; the worker processes queued jobs.

## Deploy Web App

1. Create or select a hosted Supabase project.
2. Apply all migrations in `supabase/migrations` to the staging database.
3. Configure auth redirect URLs in Supabase:
   - `https://<staging-web-host>/auth/callback`
   - `https://<staging-web-host>/auth/confirm`
4. Deploy the Next.js app from `web/`.
5. Set the web environment variables below.
6. Run the hosting provider build command:

```bash
npm install
npm run build
```

If the provider builds from the repository root, use:

```bash
npm install
cd web && npm install && npm run build
```

## Run Worker

Use one of these two staging-safe strategies.

### Always-On Polling Worker

Use this when the host supports a persistent Node process:

```bash
npm install
npm run worker:loop
```

Set:

```env
CARDALARM_WORKER_MODE=loop
CARDALARM_WORKER_POLL_INTERVAL_MS=30000
```

The worker claims one queued scan job at a time. When the queue is empty, it sleeps for the poll interval and checks again.

### Repeatable One-Shot Worker

Use this when the host supports scheduled jobs but not persistent processes:

```bash
npm install
npm run worker:once
```

Run it every 1 to 5 minutes. This is enough for staging because the admin web action writes a queued job to Postgres, and each one-shot execution either claims the job or exits cleanly when no job exists.

## Web Environment Variables

Required:

| Variable | Purpose | Staging default |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL used by SSR auth. | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key. | Supabase publishable key |
| `NEXT_PUBLIC_SITE_URL` | Public staging web URL used for auth/email links. | `https://<staging-web-host>` |
| `DATABASE_URL` or `DATABASE_POSTGRES_URL_NON_POOLING` | Server-side Postgres connection string for app queries and scan enqueueing. | Supabase pooled or direct Postgres URL |

Recommended:

| Variable | Purpose | Staging default |
| --- | --- | --- |
| `POSTGRES_POOL_MAX` | Max Postgres connections for the web process. | `4` or `8` |
| `POSTGRES_SSL_REJECT_UNAUTHORIZED` | TLS verification for Postgres. | `true` |
| `CARDALARM_DB_QUERY_TIMING` | Enables sanitized database query timing logs. | `true` during baseline runs |
| `CARDALARM_DB_QUERY_TIMING_MIN_MS` | Only log queries at or above this duration. | `250` |
| `CARDALARM_EMAIL_MODE` | Alert delivery mode. | `log` |
| `CARDALARM_ALERT_BASE_URL` | Base URL in alert links. | `https://<staging-web-host>` |
| `CARDALARM_ALERT_PROCESS_LIMIT` | Max pending alerts processed per scan pass. | `25` |
| `CARDALARM_ALERT_MAX_ATTEMPTS` | Retry limit for alert processing. | `3` |

Only set these for real email sending:

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Required only when `CARDALARM_EMAIL_MODE=resend`. |
| `CARDALARM_EMAIL_FROM` | Verified sender used only when `CARDALARM_EMAIL_MODE=resend`. |

## Worker Environment Variables

Required:

| Variable | Purpose | Staging default |
| --- | --- | --- |
| `DATABASE_URL` or `DATABASE_POSTGRES_URL_NON_POOLING` | Server-side Postgres connection string used by the worker. | Supabase direct Postgres URL |

Recommended:

| Variable | Purpose | Staging default |
| --- | --- | --- |
| `POSTGRES_POOL_MAX` | Max Postgres connections for the worker process. | `4` or `8` |
| `POSTGRES_SSL_REJECT_UNAUTHORIZED` | TLS verification for Postgres. | `true` |
| `CARDALARM_STORE_SCAN_CONCURRENCY` | Number of stores scanned concurrently. | `2` |
| `CARDALARM_PAGE_CONCURRENCY` | Number of Shopify pages fetched concurrently per store. | `1` |
| `CARDALARM_FETCH_TIMEOUT_MS` | Per-page fetch timeout. | `15000` |
| `CARDALARM_PAGE_SIZE` | Shopify products requested per page. | `100` |
| `CARDALARM_EARLY_STOP_UNCHANGED_PAGES` | Incremental scan early-stop threshold. | `2` |
| `CARDALARM_SCAN_DELAY_MIN_MS` | Lower bound between page/store work. | `2000` |
| `CARDALARM_SCAN_DELAY_MAX_MS` | Upper bound between page/store work. | `5000` |
| `CARDALARM_DB_QUERY_TIMING` | Enables sanitized database query timing logs. | `true` during baseline runs |
| `CARDALARM_DB_QUERY_TIMING_MIN_MS` | Only log queries at or above this duration. | `250` |
| `CARDALARM_WORKER_MODE` | Use `loop` for persistent polling, `once` for scheduled one-shot runs. | `loop` for services, `once` for cron |
| `CARDALARM_WORKER_POLL_INTERVAL_MS` | Idle sleep between queue checks in loop mode. | `30000` |
| `CARDALARM_ALLOW_SOURCES_JSON_FALLBACK` | Allows local `sources.json` fallback if no active DB stores exist. | `false` |
| `CARDALARM_EMAIL_MODE` | Alert delivery mode. | `log` |
| `CARDALARM_ALERT_BASE_URL` | Base URL in alert links. | `https://<staging-web-host>` |
| `CARDALARM_ALERT_PROCESS_LIMIT` | Max pending alerts processed per scan pass. | `25` |
| `CARDALARM_ALERT_MAX_ATTEMPTS` | Retry limit for alert processing. | `3` |

Do not put `DATABASE_URL`, `DATABASE_POSTGRES_URL_NON_POOLING`, or any service-role credential in public browser-exposed variables.

## Staging Scan Flow

1. Sign in as an admin user.
2. Open `/admin/stores` and confirm at least one active Shopify store exists.
3. Open `/admin/scans`.
4. Start `Scan Watchlist` for the first baseline run.
5. Confirm the UI moves to `Queued`.
6. Confirm the worker log shows `Claimed scan job`.
7. Open `/admin/scan-qa`.
8. Confirm the latest scan status changes from `queued` to `running`.
9. Watch per-store rows update with products seen, processed, matched, page counts, stop reason, and errors.
10. Confirm the scan finishes as `completed` or records a useful failure message.

## Query Timing and Logs

Enable query timing on both web and worker during baseline collection:

```env
CARDALARM_DB_QUERY_TIMING=true
CARDALARM_DB_QUERY_TIMING_MIN_MS=250
```

The logs print:

- sanitized DB target
- SQL operation type
- query fingerprint
- duration in milliseconds
- row count
- success/failure flag

The fingerprint is enough to group slow query shapes without logging SQL parameters.

## Performance Baseline Checklist

Record each run in a shared note or issue with the staging deployment version, date, and environment values.

### Before the Run

- Confirm web build SHA or commit.
- Confirm Supabase project and migration state.
- Confirm worker strategy: `worker:loop` or scheduled `worker:once`.
- Confirm active store count.
- Confirm active watchlist count and rule count.
- Confirm staging env values for scan concurrency, fetch timeout, pool max, and query timing.
- Clear stale queued/running scan jobs only if they are known leftovers from a failed test.

### Web Baseline

- `/` first response time.
- `/dashboard` authenticated response time.
- `/watchlists` authenticated response time.
- `/admin/scans` response time.
- `/admin/scan-qa` response time before scan.
- `/admin/scan-qa` response time while scan is running.
- Browser-visible errors or failed RSC payloads.
- Slow query fingerprints from web logs.

### Worker Baseline

- Time from admin click to job claim.
- Total scan duration.
- Duration by store from `/admin/scan-qa`.
- Products seen, processed, matched, and marked unavailable.
- Fetch timeout count and store failures.
- Slow query fingerprints from worker logs.
- Peak DB connection usage if the host or Supabase exposes it.

### After the Run

- Confirm `scan_jobs.status` is `completed` or has a useful failure.
- Confirm `scan_runs.status` matches the job projection.
- Confirm `store_scan_runs` rows reached `completed` or `failed`.
- Confirm `/admin/scan-qa` reflects the same state as the logs.
- Save the query timing fingerprints that exceed the threshold.
- Compare web slowness with and without an active worker scan.

## Staging Defaults

Use these values for the first hosted baseline:

```env
CARDALARM_STORE_SCAN_CONCURRENCY=2
CARDALARM_PAGE_CONCURRENCY=1
CARDALARM_FETCH_TIMEOUT_MS=15000
POSTGRES_POOL_MAX=4
CARDALARM_DB_QUERY_TIMING=true
CARDALARM_DB_QUERY_TIMING_MIN_MS=250
CARDALARM_EMAIL_MODE=log
CARDALARM_ALLOW_SOURCES_JSON_FALLBACK=false
```

Increase `POSTGRES_POOL_MAX` to `8` only if the host has enough DB connection budget and the logs show connection starvation rather than slow queries.

## Operational Notes

- Keep admin routes protected by the existing admin profile check.
- Keep scan execution out of the web app runtime.
- Keep `sources.json` disabled in staging so scans use `public.stores`.
- Keep real email disabled until the product owner explicitly configures a verified sender.
- Prefer one worker instance for initial staging baselines. Add a second only after the single-worker baseline is understood.
