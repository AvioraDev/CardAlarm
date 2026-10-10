import { friendlyError } from "@/lib/friendly-error";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { SubmitButton } from "@/app/components/submit-button";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getUserWatchlists } from "@/lib/watchlists";
import {
  deleteUserWatchlistAction,
  toggleUserWatchlistAction,
  toggleWatchlistNotificationsAction,
} from "@/lib/watchlist-actions";

export const dynamic = "force-dynamic";

function ruleSummary(ruleCount: number): string {
  if (ruleCount === 0) return "No filters yet";
  if (ruleCount === 1) return "1 watchlist filter";
  return `${ruleCount} watchlist filters`;
}

interface WatchlistsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WatchlistsPage({ searchParams }: WatchlistsPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const user = await requireUser();
  const watchlists = await getUserWatchlists(user.id);

  return (
    <div className="space-y-5 md:space-y-6">
      {error ? (
        <div role="alert" className="notice notice-error">
          {friendlyError(error)}
        </div>
      ) : null}
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="page-title text-text">Watchlists</h1>
          <p className="mt-1 max-w-xl text-text-muted">
            The players and cards CardAlarm checks stores for. Keep one broad or make it exact.
          </p>
        </div>
        <Link href="/watchlists/new" className="btn btn-primary shrink-0">
          New watchlist
        </Link>
      </header>

      {watchlists.length === 0 ? (
        <section className="panel px-5 py-10 md:px-10 md:py-14 md:text-center">
          <h2 className="section-title text-text">No watchlists yet</h2>
          <p className="mt-2 max-w-md text-text-muted md:mx-auto">
            Start simple. Add a player name, set, card number, or a few terms.
            CardAlarm will use these watchlist filters to find relevant cards.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row md:justify-center">
            <Link href="/watchlists/new" className="btn btn-primary">
              Create your first watchlist
            </Link>
          </div>
        </section>
      ) : (
        <section className="panel">
          <ul className="divide-y divide-border">
            {watchlists.map((watchlist) => (
              <li
                key={watchlist.id}
                className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="section-title text-text">
                      <Link href={`/watchlists/${watchlist.id}`} className="underline-offset-4 hover:underline">
                        {watchlist.name}
                      </Link>
                    </h2>
                    <span className="tag">{watchlist.is_active ? "Active" : "Paused"}</span>
                  </div>
                  <p className="mt-1 text-[0.8125rem] leading-[1.125rem] text-text-muted">
                    {ruleSummary(watchlist.rules.length)} · <span className="data">{watchlist.match_count}</span> found cards · Alerts {watchlist.notification_enabled ? "on" : "off"}
                  </p>
                  {watchlist.rules.slice(0, 1).map((rule) => (
                    <p key={rule.id} className="mt-1 text-[0.875rem] text-text">
                      {[rule.season, rule.brand, rule.product_line, rule.card_number ? `#${rule.card_number}` : null, rule.parallel]
                        .filter(Boolean)
                        .join(" ") || rule.include_terms || "Broad watchlist"}
                    </p>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={`/watchlists/${watchlist.id}`} className="btn btn-secondary btn-sm">
                    View
                  </Link>
                  <form action={toggleUserWatchlistAction}>
                    <input type="hidden" name="watchlistId" value={watchlist.id} />
                    <input type="hidden" name="isActive" value={String(watchlist.is_active)} />
                    <SubmitButton className="btn btn-ghost btn-sm">
                      {watchlist.is_active ? "Pause" : "Activate"}
                    </SubmitButton>
                  </form>
                  <form action={toggleWatchlistNotificationsAction}>
                    <input type="hidden" name="watchlistId" value={watchlist.id} />
                    <input type="hidden" name="notificationsEnabled" value={String(watchlist.notification_enabled)} />
                    <SubmitButton className="btn btn-ghost btn-sm">
                      {watchlist.notification_enabled ? "Turn alerts off" : "Turn alerts on"}
                    </SubmitButton>
                  </form>
                  <form action={deleteUserWatchlistAction}>
                    <input type="hidden" name="watchlistId" value={watchlist.id} />
                    <ConfirmSubmitButton message="Delete this watchlist and its matches? This can't be undone." className="btn btn-danger btn-sm">
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
