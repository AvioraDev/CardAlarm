import Link from "next/link";
import { getAdminScanQaData, type ScanQaMatchRow } from "@/lib/admin-scan-qa";

export const dynamic = "force-dynamic";

interface AdminScanQaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatPrice(value: string | number | null, currency: string | null): string {
  if (value === null) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `${currency ?? ""} ${amount.toFixed(2)}`.trim();
}

function statusClass(status: string | null | undefined): string {
  if (status === "completed" || status === "current") return "border-accent/40 bg-accent/10 text-accent";
  if (status === "running" || status === "queued") return "border-yellow-400/40 bg-yellow-400/10 text-yellow-200";
  if (status === "possible") return "border-purple-400/40 bg-purple-400/10 text-purple-200";
  if (status === "failed" || status === "timed_out") return "border-danger/40 bg-danger/10 text-danger";
  return "border-border bg-bg text-text-muted";
}

function stringifyJson(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ruleSummary(match: ScanQaMatchRow): string {
  const parts = [
    match.rookie_only ? "Rookie only" : null,
    match.brand ? `Brand: ${match.brand}` : null,
    match.product_line ? `Line: ${match.product_line}` : null,
    match.season ? `Season: ${match.season}` : null,
    match.card_number ? `#${match.card_number}` : null,
    match.parallel ? `Parallel: ${match.parallel}` : null,
    match.include_terms ? `Include: ${match.include_terms}` : null,
    match.exclude_terms ? `Exclude: ${match.exclude_terms}` : null,
    match.minimum_match_confidence !== null ? `Min confidence: ${match.minimum_match_confidence}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" • ") : "No filters recorded";
}

function queryValue(value: string | number | undefined): string {
  return value === undefined ? "" : String(value);
}

export default async function AdminScanQaPage({ searchParams }: AdminScanQaPageProps) {
  const params = await searchParams;
  const { filters, summary, storeRuns, matches, watchlists, sources } = await getAdminScanQaData(params);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <Link href="/admin" className="font-mono text-xs uppercase tracking-wider text-text-muted hover:text-accent">
          ← Admin
        </Link>
        <p className="mt-5 font-mono text-xs uppercase tracking-[0.24em] text-accent">
          Scan QA
        </p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text md:text-4xl">
              Scan progress and match evidence
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
              Admin-only read view for the latest scan job, per-store progress, and recent watchlist match output.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/scans" className="rounded-full border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-text-muted hover:border-accent hover:text-text">
              Scan Runs
            </Link>
            <Link href="/admin/inventory" className="rounded-full border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-text-muted hover:border-accent hover:text-text">
              Inventory QA
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted">Latest Scan</p>
            <h2 className="mt-1 text-xl font-semibold text-text">
              {summary ? `Job ${summary.scan_job_id ?? "—"} / Run ${summary.scan_run_id ?? "—"}` : "No scan history"}
            </h2>
          </div>
          {summary?.status ? (
            <span className={`rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wider ${statusClass(summary.status)}`}>
              {summary.status}
            </span>
          ) : null}
        </div>
        {summary ? (
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Mode", summary.mode],
              ["Processed", summary.processed],
              ["Matched", summary.matched],
              ["Attempts", summary.attempts],
              ["Locked By", summary.locked_by],
              ["Started", formatDate(summary.started_at)],
              ["Completed", formatDate(summary.completed_at)],
              ["Updated", formatDate(summary.updated_at)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-border bg-bg/60 p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold text-text">{formatValue(value)}</p>
              </div>
            ))}
            {summary.error ? (
              <div className="col-span-2 rounded-2xl border border-danger/40 bg-danger/10 p-3 md:col-span-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-danger">Error</p>
                <p className="mt-1 text-sm text-text">{summary.error}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted">Filters</p>
            <h2 className="mt-1 text-lg font-semibold text-text">Recent match evidence</h2>
          </div>
          <Link href="/admin/scan-qa" className="rounded-full border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-text-muted hover:border-accent hover:text-text">
            Clear
          </Link>
        </div>
        <form method="get" className="mt-4 grid gap-3 md:grid-cols-6">
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Watchlist</span>
            <select name="watchlistId" defaultValue={queryValue(filters.watchlistId)} className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text">
              <option value="">All watchlists</option>
              {watchlists.map((watchlist) => (
                <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Store</span>
            <select name="source" defaultValue={filters.source ?? ""} className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text">
              <option value="">All stores</option>
              {sources.map((source) => (
                <option key={source.source} value={source.source}>{source.source}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Match Status</span>
            <select name="status" defaultValue={filters.status ?? ""} className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text">
              <option value="">All statuses</option>
              <option value="current">Current</option>
              <option value="possible">Possible</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Availability</span>
            <select name="availability" defaultValue={filters.availability ?? ""} className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text">
              <option value="">All</option>
              <option value="current">Available now</option>
              <option value="possible">Possible</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Limit</span>
            <select name="limit" defaultValue={String(filters.limit)} className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-xl bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-bg hover:bg-accent-soft">
              Apply
            </button>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-border bg-bg/60 px-3 py-2 text-sm text-text-muted">
            <input type="checkbox" name="lowConfidence" value="1" defaultChecked={filters.lowConfidence} />
            Low confidence
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border bg-bg/60 px-3 py-2 text-sm text-text-muted">
            <input type="checkbox" name="rookieOnly" value="1" defaultChecked={filters.rookieOnly} />
            Rookie-only rules
          </label>
        </form>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted">Store Progress</p>
            <h2 className="mt-1 text-lg font-semibold text-text">Per-store scan progress</h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{storeRuns.length} rows</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border font-mono text-[10px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Seen</th>
                <th className="px-3 py-2">Processed</th>
                <th className="px-3 py-2">Matched</th>
                <th className="px-3 py-2">OOS</th>
                <th className="px-3 py-2">Pages</th>
                <th className="px-3 py-2">Stop</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {storeRuns.map((run) => (
                <tr key={run.id}>
                  <td className="px-3 py-3 font-semibold text-text">{run.store_slug}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${statusClass(run.status)}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{run.products_seen}</td>
                  <td className="px-3 py-3 font-mono text-xs">{run.products_processed}</td>
                  <td className="px-3 py-3 font-mono text-xs">{run.products_matched}</td>
                  <td className="px-3 py-3 font-mono text-xs">{run.products_marked_unavailable}</td>
                  <td className="px-3 py-3 font-mono text-xs">{run.pages_fetched}</td>
                  <td className="px-3 py-3 text-text-muted">{formatValue(run.stop_reason)}</td>
                  <td className="px-3 py-3 text-text-muted">{formatDate(run.started_at)}</td>
                  <td className="px-3 py-3 text-text-muted">{formatDate(run.completed_at)}</td>
                </tr>
              ))}
              {storeRuns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-text-muted">No store scan rows in the latest scan window.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted">Recent Match Evidence</p>
              <h2 className="mt-1 text-lg font-semibold text-text">Watchlist matches created or updated in the scan window</h2>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{matches.length} rows</span>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card px-6 py-12 text-center text-text-muted shadow-card">
            No watchlist matches found for the latest scan window and selected filters.
          </div>
        ) : (
          matches.map((match) => (
            <article key={match.watchlist_match_id} className="rounded-3xl border border-border bg-card p-5 shadow-card">
              <div className="grid gap-5 lg:grid-cols-[120px_1fr]">
                <div className="overflow-hidden rounded-2xl border border-border bg-bg">
                  {match.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={match.image_url} alt="" className="h-32 w-full object-cover" />
                  ) : (
                    <div className="flex h-32 items-center justify-center text-xs text-text-muted">No image</div>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${statusClass(match.watchlist_match_status)}`}>
                          Watchlist {match.watchlist_match_status ?? "unknown"}
                        </span>
                        {match.identity_status ? (
                          <span className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${statusClass(match.identity_status)}`}>
                            Identity {match.identity_status}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-border bg-bg px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                          {match.current_availability ? "Available now" : "Unavailable"}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-text">{match.title}</h3>
                      <p className="mt-1 text-sm text-text-muted">
                        {match.source} • {formatPrice(match.current_price, match.currency)}
                      </p>
                    </div>
                    {match.product_url ? (
                      <Link href={match.product_url} target="_blank" className="rounded-full border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-text-muted hover:border-accent hover:text-text">
                        Open store
                      </Link>
                    ) : null}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-border bg-bg/60 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Watchlist</p>
                      <p className="mt-1 font-semibold text-text">{match.watchlist_name}</p>
                      <p className="mt-2 text-xs leading-5 text-text-muted">{ruleSummary(match)}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-bg/60 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Classification</p>
                      <dl className="mt-2 space-y-1 text-xs text-text-muted">
                        <div>Category: {formatValue(match.category)}</div>
                        <div>Year: {formatValue(match.year)}</div>
                        <div>Player: {formatValue(match.classified_player_name)}</div>
                        <div>Set: {formatValue(match.set_name ?? match.classified_product_line)}</div>
                        <div>Card #: {formatValue(match.classified_card_number)}</div>
                        <div>Rookie / Auto / Numbered: {formatValue(match.is_rookie)} / {formatValue(match.is_auto)} / {formatValue(match.is_serial)}</div>
                        <div>Confidence: {formatValue(match.classification_confidence)}</div>
                      </dl>
                    </div>
                    <div className="rounded-2xl border border-border bg-bg/60 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Identity Match</p>
                      <dl className="mt-2 space-y-1 text-xs text-text-muted">
                        <div>Player: {formatValue(match.matched_player_name)}</div>
                        <div>Player ID: {formatValue(match.matched_player_id)}</div>
                        <div>Checklist ID: {formatValue(match.checklist_id)}</div>
                        <div>Confidence: {formatValue(match.identity_confidence)}</div>
                        <div>Matcher: {formatValue(match.matcher_version)}</div>
                      </dl>
                    </div>
                    <div className="rounded-2xl border border-border bg-bg/60 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Watchlist Match</p>
                      <dl className="mt-2 space-y-1 text-xs text-text-muted">
                        <div>ID: {match.watchlist_match_id}</div>
                        <div>Store product: {match.store_product_id}</div>
                        <div>Confidence: {formatValue(match.watchlist_match_confidence)}</div>
                        <div>Created: {formatDate(match.created_at)}</div>
                        <div>Updated: {formatDate(match.updated_at)}</div>
                      </dl>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-bg/60 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Matched Fields</p>
                      <p className="mt-2 text-xs leading-5 text-text-muted">{stringifyJson(match.matched_fields)}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-bg/60 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Match Reasons</p>
                      <p className="mt-2 text-xs leading-5 text-text-muted">{stringifyJson(match.match_reasons)}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-bg/60 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Unmatched Fields</p>
                      <p className="mt-2 text-xs leading-5 text-text-muted">{stringifyJson(match.unmatched_fields)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
