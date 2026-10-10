#!/usr/bin/env bash
# Render CardAlarm against a seeded local Postgres with a TEMPORARY auth stub, screenshot every screen, then clean up.
# Usage: .claude/skills/cardalarm-visual-verification/scripts/run.sh [outDir]
# Never commit while this runs: the stub patch edits web/src/lib/auth.ts and is reverted on exit.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
SKILL="$ROOT/.claude/skills/cardalarm-visual-verification"
VER="${VERIFY_DIR:-/tmp/cardalarm-verify}"
OUT="${1:-$VER/shots}"
PORT="${PORT:-3111}"
PGPORT="${PGPORT:-54329}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
mkdir -p "$VER" && chmod 755 "$VER"

as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
DEV_PID=""
cleanup() {
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true
  (cd "$ROOT" && git apply -R "$SKILL/fixtures/auth-stub.patch" 2>/dev/null) || true
  as_pg "$PGBIN/pg_ctl -D $VER/pg/data stop -m fast" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if git -C "$ROOT" diff --quiet -- web/src/lib/auth.ts; then :; else echo "web/src/lib/auth.ts has uncommitted changes; refusing to stub it" >&2; exit 2; fi

# 1. database (created once, restored from the fixture)
if [ ! -d "$VER/pg/data" ]; then
  mkdir -p "$VER/pg" && { [ "$(id -u)" = 0 ] && chown -R postgres "$VER/pg" || true; }
  as_pg "$PGBIN/initdb -D $VER/pg/data -A trust >/dev/null"
fi
rm -f "$VER/pg/data/postmaster.pid"
as_pg "$PGBIN/pg_ctl -D $VER/pg/data -o '-p $PGPORT -k $VER/pg' -l $VER/pg/log -w start" >/dev/null
if ! psql -h "$VER/pg" -p "$PGPORT" -U postgres -tAc "select 1 from pg_database where datname='ca'" | grep -q 1; then
  psql -h "$VER/pg" -p "$PGPORT" -U postgres -qc "create database ca" 
  zcat "$SKILL/fixtures/verify-db.sql.gz" | psql -h "$VER/pg" -p "$PGPORT" -U postgres -d ca -q -v ON_ERROR_STOP=0 >/dev/null
fi

# 2. temporary auth stub + dev server (no Supabase env, so the proxy passes requests through)
(cd "$ROOT" && git apply "$SKILL/fixtures/auth-stub.patch")
rm -rf "$ROOT/web/.next"
(cd "$ROOT/web" && DATABASE_URL="postgresql://postgres@localhost:$PGPORT/ca?host=$VER/pg&sslmode=disable" PGSSLMODE=disable POSTGRES_SSL_REJECT_UNAUTHORIZED=false \
  npx next dev -p "$PORT" >"$VER/dev.log" 2>&1) &
DEV_PID=$!
for i in $(seq 1 60); do curl -s -o /dev/null --max-time 5 "http://localhost:$PORT/login" && break; sleep 2; done
curl -s -o /dev/null -w "dashboard HTTP %{http_code}\n" --max-time 120 "http://localhost:$PORT/dashboard"

# 3. screenshots
node "$SKILL/scripts/shoot.js" "$OUT" "http://localhost:$PORT"
