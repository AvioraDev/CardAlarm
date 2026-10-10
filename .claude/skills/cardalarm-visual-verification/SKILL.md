---
name: cardalarm-visual-verification
description: Render CardAlarm locally against seeded data and screenshot every customer screen (360px and 1280px, light and dark) to check a UI change by eye. Use before committing or opening a PR for any change to web/ pages, components, styles or copy, and whenever someone asks to "see" the app.
---

# Visual verification harness

Tests and a green build do not tell you what the app looks like. Run this for any UI change, then **look at the screenshots** (open the images; do not just trust "0 problems"). Part of the checklist in `cardalarm-ux-review`.

## Run it
```bash
.claude/skills/cardalarm-visual-verification/scripts/run.sh [outDir]   # default /tmp/cardalarm-verify/shots
```
It (1) starts a throwaway Postgres 16 on port 54330 restored from `fixtures/verify-db.sql.gz` (285 synthetic NBA listings, 4 stores, 4 watchlists, confirmed and possible matches), (2) applies `fixtures/auth-stub.patch`, a **temporary** stub (two files: `web/src/lib/auth.ts` signs you in as the seeded admin user; `web/src/lib/watchlists.ts` reads watchlists from Postgres because the Supabase REST API does not exist locally), (3) starts `next dev` on port 3111 with no Supabase env so the proxy passes through, (4) captures 12 screens x phone/desktop x light/dark with `scripts/shoot.js`, then (5) reverts the stub and stops the database on exit.

- Never commit while it runs. It refuses to start if `web/src/lib/auth.ts` or `watchlists.ts` already has changes. After a crash run `git checkout web/src/lib/auth.ts web/src/lib/watchlists.ts` and `git status` to be sure the stub is gone.
- Do not run it while another process is using `web/.next` (a parallel `next build` or dev server).
- Postgres needs the `postgres` OS user when running as root; the harness handles that. Binaries are at `/usr/lib/postgresql/16/bin` (override with `PGBIN`).
- `shoot.js` fails (exit 1) on any horizontal overflow or navigation error, and prints which screen.

## What it can and cannot show
- Real data paths: the ranked feed, pagination, filters and watchlists run for real against seeded rows. The seeded product images point at `cdn.shopify.com/s/files/seed/...`; the script substitutes generated card art, so image *content* is a stand-in, but sizing, matting, fallbacks and layout are real.
- The Next.js dev indicator (round "N" badge, bottom left) appears in dev mode only.
- Anything else that reads through the Supabase REST client (not `pg`) will render the error screen in this harness: check which data layer a page uses, and extend the stub patch rather than concluding the page is broken. If a screen shows 'Something went wrong', read `<outDir>/../dev.log` first.
- Not covered: real Supabase auth/RLS, email, store scanning, the empty first-run dashboard (needs a user with no watchlists), loading/error screens (need routes that force them). Check those by reading the code and tests, and say so in the PR.

## Rebuilding the fixture
If migrations change the tables the pages read, regenerate: restore the current fixture, apply the new migration, then
`pg_dump -h <sockdir> -p 54329 -U postgres -d ca --no-owner --no-privileges | gzip -9 > fixtures/verify-db.sql.gz`.
Keep data fictional. Refresh `fixtures/auth-stub.patch` if `web/src/lib/auth.ts` or `watchlists.ts` changes (`git apply --check` it).

## Review checklist when looking at the shots
Cards before chrome on a phone; confirmed vs possible unmistakable; no clipped text, no overlapping elements, nav reachable (sign out) at 360px; dark and light both legible (contrast); focus state visible; numbers aligned; empty/filter-empty states sensible. File a note for anything odd rather than assuming it is the dev environment.
