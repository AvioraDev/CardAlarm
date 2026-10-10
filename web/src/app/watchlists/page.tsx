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
    <div className="space-y-6">
      {error ? (
        <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text">
          {friendlyError(error)}
        </div>
      ) : null}
      <section className="panel p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Watchlists</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text md:text-4xl">
              Cards you&apos;re chasing
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
              Create broad or specific watchlists for players, sets, cards, parallels,
              numbered cards, autos, relics, and price ranges. CardAlarm uses them to find
              available cards for you.
            </p>
          </div>
          <Link
            href="/watchlists/new" className="btn btn-primary">
            New watchlist
          </Link>
        </div>
      </section>

      {watchlists.length === 0 ? (
        <section className="panel px-6 py-16 text-center">
          <h2 className="text-xl font-semibold text-text">No watchlists yet</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-muted">
            Start simple. Add a player name, set, card number, or a few terms.
            CardAlarm will use these watchlist filters to find relevant cards.
          </p>
          <Link
            href="/watchlists/new"
            className="btn btn-primary mt-6"
          >
            Create your first watchlist
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {watchlists.map((watchlist) => (
            <article key={watchlist.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-text">
                    <Link href={`/watchlists/${watchlist.id}`} className="hover:text-accent">
                      {watchlist.name}
                    </Link>
                  </h2>
                  <p className="mt-1 text-xs text-text-muted">
                    {ruleSummary(watchlist.rules.length)} · <span className="data">{watchlist.match_count}</span> found cards · Alerts {watchlist.notification_enabled ? "on" : "off"}
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
                  className="btn btn-secondary btn-sm"
                >
                  View
                </Link>
                <form action={toggleUserWatchlistAction}>
                  <input type="hidden" name="watchlistId" value={watchlist.id} />
                  <input type="hidden" name="isActive" value={String(watchlist.is_active)} />
                  <SubmitButton className="btn btn-secondary btn-sm">
                    {watchlist.is_active ? "Pause" : "Activate"}
                  </SubmitButton>
                </form>
                <form action={toggleWatchlistNotificationsAction}>
                  <input type="hidden" name="watchlistId" value={watchlist.id} />
                  <input type="hidden" name="notificationsEnabled" value={String(watchlist.notification_enabled)} />
                  <SubmitButton className="btn btn-secondary btn-sm">
                    {watchlist.notification_enabled ? "Alerts On" : "Alerts Off"}
                  </SubmitButton>
                </form>
                <form action={deleteUserWatchlistAction}>
                  <input type="hidden" name="watchlistId" value={watchlist.id} />
                  <ConfirmSubmitButton message="Delete this watchlist and its matches? This can't be undone." className="btn btn-danger btn-sm">
                    Delete
                  </ConfirmSubmitButton>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
