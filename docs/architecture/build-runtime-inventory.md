# Build, runtime, and configuration inventory

**Repository snapshot:** `09f44f230324467007bc70dbc61571b579386fd9` (inventory basis). This records checked-in files at that revision. Recommendations in historical runbooks are identified separately from checked deployment state.

## Project layout and toolchain

- The repository has two npm projects: root `cardalarm` (scanner/worker, migration utilities and tests) and `web` (Next.js application). Each has its own `package.json` and npm lockfile; lockfile format is v3. There is no root `workspaces` declaration. See [`package.json`](../../package.json#L1), [`web/package.json`](../../web/package.json#L1), [`package-lock.json`](../../package-lock.json#L1), [`web/package-lock.json`](../../web/package-lock.json#L1).
- Root direct runtime dependencies are better-sqlite3, node-cron, pg and xlsx; development dependencies include Jest, ts-jest, tsx and TypeScript. The committed root lock resolves them respectively to 12.9.0, 3.0.3, 8.20.0, 0.18.5; Jest 29.7.0, ts-jest 29.4.9, tsx 4.21.0, TypeScript 5.9.3. Declared ranges remain as in `package.json`.
- Web direct runtime dependencies resolve to Next 16.2.4, React/react-dom 19.2.4, `@supabase/ssr` 0.10.2, `@supabase/supabase-js` 2.105.3 and pg 8.20.0. Dev tools resolve to ESLint 9.39.4, eslint-config-next 16.2.4, Tailwind 4.2.4, TypeScript 5.9.3. Exact resolutions are in `web/package-lock.json`; declarations are in `web/package.json`.
- No Node version pin (`.nvmrc`, `.node-version`, `engines`) or package-manager version pin is evidenced in the checked root/web manifests and listed configuration. The repository does not state a supported Node release.

## Commands and execution paths

Root scripts ( [`package.json`](../../package.json#L5)):

| Script | Effect |
| --- | --- |
| `npm run engine:dev` | Runs `tsx watch engine/src/index.ts`. |
| `npm run engine:start` | Runs `tsx engine/src/index.ts`. |
| `npm run worker:once` | Runs `tsx engine/src/worker.ts` once. |
| `npm run worker:loop` | Runs the worker with `--loop`. |
| `npm run web:dev` / `npm run web:build` | Changes into `web` and invokes its dev/build script. |
| `npm test` | Jest using root `jest.config.js`; test roots are `engine`, matching `__tests__/**/*.test.ts`. |
| `npm run db:migrate:supabase*` | Runs the SQLite-to-Supabase script with apply-schema, truncate or dry-run flags. |
| `npm run supabase:migrations:*` | Calls the Supabase CLI wrapper to list, dry-run or push migrations. |
| `npm run classify:backfill` | Runs the classification backfill through tsx. |
| `npm run seed` | Runs `node seed.js`. |

Web scripts ( [`web/package.json`](../../web/package.json#L6)): `npm run dev` → `next dev`, `npm run build` → `next build`, `npm start` → `next start`, and `npm run lint` → `eslint`. The web package defines no test script. The general web README is the create-next-app starter README and gives generic local/deploy guidance, not CardAlarm-specific setup ([`web/README.md`](../../web/README.md#L1)).

The root TypeScript configuration is strict, targets ES2022/CommonJS and includes only `engine/src/**/*.ts`; it emits to `dist` when used as a compiler project ([`tsconfig.json`](../../tsconfig.json#L1)). The web config is strict, `noEmit`, uses bundler resolution and the Next plugin, and includes TS/TSX/MTS source plus generated Next type paths ([`web/tsconfig.json`](../../web/tsconfig.json#L1)). No build script invokes `tsc` explicitly. Jest targets only engine tests (`jest.config.js` lines 2–8).

## Runtime topology and database tooling

The staging runbook recommends three separate hosted components: server-rendered Next.js from `web/`, hosted Supabase for database/auth, and a separately hosted root Node worker or scheduled one-shot process. It describes the web process as enqueue-only and the worker as queue consumer. This is documented intended topology, not proof of deployed resources ([`docs/staging-deployment-runbook.md`](../staging-deployment-runbook.md#L7), lines 18–72).

`supabase/config.toml` identifies local Supabase project `cardalarm`, PostgreSQL major version 15, local API/database/studio/inbucket ports and localhost auth URLs ([`supabase/config.toml`](../../supabase/config.toml#L1)). There are checked-in SQL migrations under `supabase/migrations/`; the runbook instructs applying them in hosted staging but does not provide a hosted project identity or migration state.

The Supabase CLI wrapper expects an externally installed `supabase` executable (it invokes it directly); it reads root `.env` and `web/.env.local`, and chooses `DATABASE_POSTGRES_URL_NON_POOLING` then `DATABASE_URL` ([`scripts/supabase-cli.js`](../../scripts/supabase-cli.js#L1)). This is a CLI prerequisite, not declared as an npm dependency. The SQLite import script also reads root `.env`, defaults SQLite path to `cardalarm.db`, and selects `SUPABASE_DB_URL`, `DATABASE_POSTGRES_URL_NON_POOLING` or `DATABASE_URL` ([`scripts/migrate-sqlite-to-supabase.js`](../../scripts/migrate-sqlite-to-supabase.js#L1)).

## Environment variable inventory

Names and purposes below are derived from `.env.example`, code references and the staging runbook. No secret values are reproduced. The example file contains placeholders only ([`.env.example`](../../.env.example#L1)); the runbook distinguishes web/worker deployment requirements ([`docs/staging-deployment-runbook.md`](../staging-deployment-runbook.md#L74)).

| Variable(s) | Purpose / consumer |
| --- | --- |
| `SQLITE_DB_PATH` | SQLite source path for migration/import tooling. |
| `SUPABASE_PROJECT_URL` | Supabase project URL setting in example config. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase URL and publishable key used by web auth. |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for auth and email links; defaults to localhost in code. |
| `DATABASE_URL`, `DATABASE_POSTGRES_URL_NON_POOLING` | Server-side Postgres URL alternatives used by web and engine; non-pooling variable takes precedence. |
| `SUPABASE_DB_URL` | Additional Postgres URL option for SQLite-to-Supabase migration script. |
| `POSTGRES_SSL_REJECT_UNAUTHORIZED`, `SUPABASE_DB_SSL_REJECT_UNAUTHORIZED`, `PGSSLMODE` | Postgres TLS verification/mode controls. The SSL booleans are in `.env.example`; `PGSSLMODE` is code-consumed. |
| `POSTGRES_POOL_MAX` | Maximum Postgres pool size; code fallback is 8. Runbook suggests tuning for host connection budget. |
| `CARDALARM_DB_QUERY_TIMING`, `CARDALARM_DB_QUERY_TIMING_MIN_MS` | Enables sanitized DB timing logs and sets minimum logged duration. |
| `CARDALARM_PAGE_CONCURRENCY`, `CARDALARM_STORE_SCAN_CONCURRENCY`, `CARDALARM_PAGE_SIZE`, `CARDALARM_EARLY_STOP_UNCHANGED_PAGES`, `CARDALARM_FETCH_TIMEOUT_MS`, `CARDALARM_SCAN_DELAY_MIN_MS`, `CARDALARM_SCAN_DELAY_MAX_MS` | Scanner page/store parallelism, fetch page size, incremental stop threshold, fetch timeout and pacing. |
| `CARDALARM_WORKER_MODE`, `CARDALARM_WORKER_POLL_INTERVAL_MS` | Worker single-run/loop mode and idle poll interval. CLI `worker:loop` also passes `--loop`. |
| `CARDALARM_ALLOW_SOURCES_JSON_FALLBACK` | Enables legacy `sources.json` scanner fallback when configured to true. |
| `CARDALARM_EMAIL_MODE`, `RESEND_API_KEY`, `CARDALARM_EMAIL_FROM` | Email delivery mode; Resend credential and sender are needed for `resend` mode. |
| `CARDALARM_ALERT_BASE_URL`, `CARDALARM_ALERT_PROCESS_LIMIT`, `CARDALARM_ALERT_MAX_ATTEMPTS` | Alert links base URL, per-pass limit and retry cap. |

## Deployment evidence and gaps

- Checked-in files include no provider deployment manifest or container definition among root/web files inspected: no Vercel project config, Dockerfile/Compose, Render/Fly/Netlify config, Procfile or CI workflow was found. `web/README.md` mentions Vercel as generic Next.js boilerplate guidance, not evidence of an actual project deployment ([`web/README.md`](../../web/README.md#L20)).
- `docs/staging-deployment-runbook.md` is explicitly a staging runbook with suggested install/build/worker commands, variables, scan flow and baseline checklist. It offers `npm install` then web build, or root install plus web install/build; it recommends `worker:loop` or scheduled `worker:once`. Treat these as historical instructions, not verified currently deployed configuration.
- No deployment host/account/project identifiers, public hostname, CI/CD trigger, build image/runtime version, environment assignments, worker scheduler cadence actually configured, production secret store, deployed commit/SHA, live health-check evidence, or hosted Supabase migration status is established by these repository files. No live service was queried for this inventory.
- Verification reported for this snapshot: clean `npm ci` in both packages; all 33 Jest suites / 281 tests passed; root and web `npx tsc --noEmit` passed; web lint passed; web production build passed with network access. In the restricted sandbox, the build's Google Fonts fetch failed because network access was unavailable. Build output also warned that multiple lockfiles caused Next.js to infer a workspace root. These are verification results, not provider deployment evidence. No migration or live integration/service was performed; no live database credentials were configured.
- Dependency audit counts reported for this snapshot: root 38 findings (2 low, 3 moderate, 33 high) and web 15 (1 low, 1 moderate, 12 high, 1 critical). These are raw audit totals; they have not been triaged for reachability or exploitability and do not establish that every finding affects direct runtime code.
