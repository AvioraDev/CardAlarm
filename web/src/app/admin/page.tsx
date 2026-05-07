import Link from "next/link";
import { getWatchlist } from "@/lib/queries";
import { addWatchlistEntry } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { WatchlistTable } from "../components/watchlist-table";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const watchlist = await getWatchlist();

  return (
    <div>
      <section className="mb-6 rounded-3xl border border-border bg-card p-6 shadow-card">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Admin</p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text">
              Operations
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Manage beta operations. Store scans should be triggered from the scan page;
              this legacy watchlist panel remains for compatibility during migration.
            </p>
          </div>
          <Link
            href="/admin/scans"
            className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
          >
            Open Scans
          </Link>
        </div>
      </section>

      <h2 className="mb-6 font-mono text-sm font-bold uppercase tracking-[0.15em] text-text">
        Legacy Watchlist Management
      </h2>

      {/* Current Watchlist */}
      <WatchlistTable entries={watchlist} />

      {/* Add Entry Form */}
      <div className="mt-6 border border-border bg-surface p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-4">
          Add Target
        </h2>
        <form action={addWatchlistEntry} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="playerName"
                className="block font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1"
              >
                Player Name *
              </label>
              <input
                type="text"
                id="playerName"
                name="playerName"
                required
                placeholder="LeBron James"
                className="w-full bg-bg border border-border px-3 py-2 font-mono text-sm text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="variants"
                className="block font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1"
              >
                Variants
              </label>
              <input
                type="text"
                id="variants"
                name="variants"
                placeholder="Silver, Prizm, Holo"
                className="w-full bg-bg border border-border px-3 py-2 font-mono text-sm text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="targetNumbers"
                className="block font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1"
              >
                Target Card #s
              </label>
              <input
                type="text"
                id="targetNumbers"
                name="targetNumbers"
                placeholder="241, 100"
                className="w-full bg-bg border border-border px-3 py-2 font-mono text-sm text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          <div>
            <button
              type="submit"
              className="font-mono text-xs font-bold uppercase tracking-wider bg-accent text-bg px-6 py-2 hover:bg-accent-hover transition-colors"
            >
              Add to Watchlist
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
