import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getUserWatchlist } from "@/lib/watchlists";
import {
  backfillUserWatchlistAction,
  deleteUserWatchlistAction,
  toggleUserWatchlistAction,
} from "@/lib/watchlist-actions";

interface WatchlistDetailPageProps {
  params: Promise<{ id: string }>;
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function formatPrice(value: number | null): string {
  if (value === null) return "Any";
  return `$${value.toFixed(2)}`;
}

export default async function WatchlistDetailPage({ params }: WatchlistDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const watchlistId = Number(id);
  if (!Number.isInteger(watchlistId)) notFound();

  const watchlist = await getUserWatchlist(user.id, watchlistId);
  if (!watchlist) notFound();
  const rule = watchlist.rules[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link href="/watchlists" className="font-mono text-xs uppercase tracking-wider text-text-muted hover:text-accent">
              ← Watchlists
            </Link>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-text md:text-4xl">
              {watchlist.name}
            </h1>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              Created {new Date(watchlist.created_at).toLocaleDateString()} · {watchlist.match_count} found cards
            </p>
          </div>
          <span className={watchlist.is_active ? "tag tag-accent" : "tag"}>
            {watchlist.is_active ? "Active" : "Paused"}
          </span>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <form action={toggleUserWatchlistAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <input type="hidden" name="isActive" value={String(watchlist.is_active)} />
            <button type="submit" className="rounded-full border border-border px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent">
              {watchlist.is_active ? "Pause" : "Activate"}
            </button>
          </form>
          <form action={deleteUserWatchlistAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <button type="submit" className="rounded-full border border-danger/40 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-danger transition-colors hover:bg-danger hover:text-bg">
              Delete
            </button>
          </form>
          <form action={backfillUserWatchlistAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <button type="submit" className="rounded-full bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover">
              Refresh Matches
            </button>
          </form>
        </div>
      </section>

      {rule ? (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Structured Rule</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              ["Include terms", rule.include_terms ?? "Any"],
              ["Exclude terms", rule.exclude_terms ?? "None"],
              ["Brand", rule.brand ?? "Any"],
              ["Product line", rule.product_line ?? "Any"],
              ["Season", rule.season ?? "Any"],
              ["Card number", rule.card_number ?? "Any"],
              ["Parallel", rule.parallel ?? "Any"],
              ["Price", `${formatPrice(rule.min_price)} – ${formatPrice(rule.max_price)}`],
              ["Minimum confidence", `${Math.round(rule.minimum_match_confidence * 100)}%`],
              ["Rookie only", yesNo(rule.rookie_only)],
              ["Autograph only", yesNo(rule.autograph_only)],
              ["Relic only", yesNo(rule.relic_only)],
              ["Serial numbered", yesNo(rule.serial_numbered_only)],
              ["Graded only", yesNo(rule.graded_only)],
              ["Raw only", yesNo(rule.raw_only)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-border bg-bg/45 p-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
                <p className="mt-1 text-sm text-text">{value}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Found Cards</p>
        <h2 className="mt-3 text-xl font-semibold text-text">
          {watchlist.match_count} cards currently match this watchlist
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
          CardAlarm refreshes this watchlist when it is created or updated, then shows
          matching cards in For You.
        </p>
      </section>
    </div>
  );
}
