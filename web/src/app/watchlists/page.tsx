import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getUserWatchlists } from "@/lib/watchlists";
import { deleteUserWatchlistAction, toggleUserWatchlistAction } from "@/lib/watchlist-actions";

export const dynamic = "force-dynamic";

function ruleSummary(ruleCount: number): string {
  if (ruleCount === 0) return "No structured rules yet";
  if (ruleCount === 1) return "1 structured rule";
  return `${ruleCount} structured rules`;
}

export default async function WatchlistsPage() {
  const user = await requireUser();
  const watchlists = await getUserWatchlists(user.id);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
              Watchlists
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text md:text-4xl">
              Tell CardAlarm what matters
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
              Create broad or specific watchlists for players, sets, cards, parallels,
              serials, autos, relics, and price ranges. CardAlarm uses them to find
              available cards for you.
            </p>
          </div>
          <Link
            href="/watchlists/new"
            className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
          >
            New Watchlist
          </Link>
        </div>
      </section>

      {watchlists.length === 0 ? (
        <section className="rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
          <h2 className="text-xl font-semibold text-text">No watchlists yet</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-muted">
            Start simple. Add a player name, set, card number, or a few terms.
            CardAlarm will use these structured rules to find relevant cards.
          </p>
          <Link
            href="/watchlists/new"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
          >
            Create First Watchlist
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {watchlists.map((watchlist) => (
            <article key={watchlist.id} className="rounded-3xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-text">
                    <Link href={`/watchlists/${watchlist.id}`} className="hover:text-accent">
                      {watchlist.name}
                    </Link>
                  </h2>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                    {ruleSummary(watchlist.rules.length)} · {watchlist.match_count} found cards
                  </p>
                </div>
                <span className={watchlist.is_active ? "tag tag-accent" : "tag"}>
                  {watchlist.is_active ? "Active" : "Paused"}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm leading-6 text-text-muted">
                {watchlist.rules.slice(0, 1).map((rule) => (
                  <p key={rule.id}>
                    {[rule.season, rule.brand, rule.product_line, rule.card_number ? `#${rule.card_number}` : null, rule.parallel]
                      .filter(Boolean)
                      .join(" ") || rule.include_terms || "Broad watchlist"}
                  </p>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={`/watchlists/${watchlist.id}`}
                  className="rounded-full border border-border px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent"
                >
                  View
                </Link>
                <form action={toggleUserWatchlistAction}>
                  <input type="hidden" name="watchlistId" value={watchlist.id} />
                  <input type="hidden" name="isActive" value={String(watchlist.is_active)} />
                  <button
                    type="submit"
                    className="rounded-full border border-border px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-text-muted transition-colors hover:border-accent hover:text-text"
                  >
                    {watchlist.is_active ? "Pause" : "Activate"}
                  </button>
                </form>
                <form action={deleteUserWatchlistAction}>
                  <input type="hidden" name="watchlistId" value={watchlist.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-danger/40 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-danger transition-colors hover:bg-danger hover:text-bg"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
