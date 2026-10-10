---
name: cardalarm-paginated-feed
description: The pattern for paginated customer lists in CardAlarm (For You feed, Saved) - page parsing, stable ordering, one ranked query for rows and totals, URL-preserved filters, and the tests and Postgres checks to run. Use when adding or changing any list that can grow beyond one screen.
---

# Paginated customer feed pattern

Reference implementation: `web/src/lib/pagination.ts` (pure helpers), `web/src/lib/queries.ts` + `inventory-sql.ts` (`rankedWatchlistMatchesSql`), `web/src/app/components/pagination-nav.tsx`, and the dashboard and Saved pages.

## Rules
1. **URL state**: `?page=N`, 48 per page, hard cap 96. Server-rendered so the back button, sharing and filters work. Parse with `parsePage` / `clampPageSize`; garbage, zero, negatives and huge values fall back safely. `pageHref` preserves filters and drops `page` on page 1. Changing a filter resets `page`.
2. **Stable order**: `ORDER BY` must end in a unique tiebreak (`id desc`) or pages skip/repeat rows when `created_at` ties. Confirmed matches sort before possible ones.
3. **One ranked query** (`select distinct on (sp.id) ...` keeping the strongest match per product) feeds rows, the stats/summary and the total, so confirmed + possible = total = pagination total. Do not count with a separate, differently-filtered query.
4. **User scoping stays in SQL** (`$1` = user id on the watchlist join); parameterised, no string-built values; offsets floored and NaN-safe (`clampOffset`).
5. **Past the last page** shows the last valid page or an explicit empty state, never a blank grid.
6. **Facet/filter counts** describe all results, not the current page.
7. Customer pages never trigger store scans; pagination reads existing data only.

## Tests to write
- Pure helpers (`engine/__tests__/pagination.test.ts`): parse/clamp/window/href edge cases.
- Source-pin tests update with the code (`inventory-sql`, `performance-readiness`, `customer-navigation`): grep `engine/__tests__` for pinned strings before changing code.
- **Real Postgres check** for SQL changes: seed hundreds of rows with tied `created_at`, duplicate matches across watchlists, an inactive watchlist, dismissed/not-a-match/saved feedback and a second user. For several filter sets and page sizes assert: no duplicate rows across pages, rows across all pages = `stats.total`, confirmed + possible = total, confirmed rows precede possible, page after the last is empty, other users' rows never appear. Postgres 16 binaries: `/usr/lib/postgresql/16/bin` (run as the `postgres` OS user, port 54329, directories under the session scratchpad; stop it afterwards).

## Known limits (revisit when volume grows)
- Offset paging can shift a row between loads if matches change meanwhile; switch to keyset paging if it matters.
- The stats query evaluates the ranked subquery twice when filters are active; measure with `CARDALARM_DB_QUERY_TIMING=1` before launch.
- The "possible" filter matches if any match row is possible while the card shows the best row's status (tracked for P3 Identity & Accuracy).
