import { getWatchlist } from "@/lib/queries";
import { addWatchlistEntry } from "@/lib/actions";
import { WatchlistTable } from "../components/watchlist-table";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const watchlist = getWatchlist();

  return (
    <div>
      <h1 className="font-mono text-sm font-bold uppercase tracking-[0.15em] text-text mb-6">
        Watchlist Management
      </h1>

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
