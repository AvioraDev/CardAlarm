import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getLatestScanRun, getRecentScanRuns, getRecentStoreScanRuns } from "@/lib/queries";
import { ScanPanel } from "../../components/scan-panel";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function statusClass(status: string): string {
  if (status === "completed") return "tag tag-accent";
  if (status === "failed") return "tag border-danger/40 bg-danger/10 text-danger";
  return "tag border-accent/40 bg-accent/10 text-accent scan-pulse";
}

export default async function AdminScansPage() {
  await requireAdmin();
  const [latestScanRun, recentRuns, recentStoreRuns] = await Promise.all([
    getLatestScanRun(),
    getRecentScanRuns(12),
    getRecentStoreScanRuns(24),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <Link href="/admin" className="font-mono text-xs uppercase tracking-wider text-text-muted hover:text-accent">
          ← Admin
        </Link>
        <p className="mt-5 font-mono text-xs uppercase tracking-[0.24em] text-accent">
          Store Scans
        </p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text md:text-4xl">
              Scan cached store inventory
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
              Trigger a scan, track progress, and review recent scan status. Daily scans
              populate cached listings; watchlists then backfill against that cache.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-bg/60 px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-text-muted">
            {latestScanRun?.completed_at
              ? `Last completed ${formatDate(latestScanRun.completed_at)}`
              : "No completed scan yet"}
          </div>
        </div>
      </section>

      <ScanPanel initialScanRun={latestScanRun} />

      <section className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
              Per-Store Runs
            </p>
            <h2 className="mt-2 text-xl font-semibold text-text">Store scan history</h2>
          </div>
          <Link href="/admin/stores" className="font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-accent">
            Manage stores
          </Link>
        </div>

        {recentStoreRuns.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-bg/45 p-8 text-center">
            <p className="text-sm text-text-muted">No per-store scan runs yet.</p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[1160px] text-left text-sm">
              <thead className="bg-bg/70 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Fetched</th>
                  <th className="px-4 py-3">Processed</th>
                  <th className="px-4 py-3">Matched</th>
                  <th className="px-4 py-3">Marked OOS</th>
                  <th className="px-4 py-3">Pages</th>
                  <th className="px-4 py-3">Early Stop</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentStoreRuns.map((run) => (
                  <tr key={run.id} className="bg-card/70">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-text">{run.store_name ?? run.store_slug}</div>
                      <div className="mt-1 font-mono text-xs text-text-muted">{run.store_slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusClass(run.status)}>{run.status}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text">{run.products_seen.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text">{run.products_processed.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-accent">{run.products_matched.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text">{run.products_marked_unavailable.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text">{run.pages_fetched.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">
                      {run.early_stop_enabled
                        ? `${run.stopped_early ? "Stopped" : "On"} / ${run.early_stop_unchanged_pages ?? 2}`
                        : "Off"}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">{formatDate(run.started_at)}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{formatDate(run.completed_at)}</td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-xs text-danger" title={run.error_message ?? undefined}>
                      {run.error_message ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
              Recent Runs
            </p>
            <h2 className="mt-2 text-xl font-semibold text-text">Scan history</h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Polls while running
          </span>
        </div>

        {recentRuns.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-bg/45 p-8 text-center">
            <p className="text-sm text-text-muted">No scan runs yet.</p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-bg/70 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Processed</th>
                  <th className="px-4 py-3">Matched</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentRuns.map((run) => (
                  <tr key={run.id} className="bg-card/70">
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">#{run.id}</td>
                    <td className="px-4 py-3 font-mono text-xs uppercase text-text">{run.mode}</td>
                    <td className="px-4 py-3">
                      <span className={statusClass(run.status)}>{run.status}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text">{run.processed.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-accent">{run.matched.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{formatDate(run.started_at)}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{formatDate(run.completed_at)}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-xs text-danger" title={run.error ?? undefined}>
                      {run.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
