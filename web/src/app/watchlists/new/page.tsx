import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createWatchlistAction } from "@/lib/watchlist-actions";

interface NewWatchlistPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewWatchlistPage({ searchParams }: NewWatchlistPageProps) {
  await requireUser();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
          New Watchlist
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text">
          Create a structured target
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
          Keep it broad if you want all cards for a player or set. Add optional filters
          when you know the exact season, card number, parallel, or price range.
        </p>
        {error ? (
          <div className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text">
            {decodeURIComponent(error)}
          </div>
        ) : null}
      </section>

      <form action={createWatchlistAction} className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Watchlist name *</span>
            <input
              name="name"
              required
              placeholder="Victor Wembanyama Prizm rookies"
              className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Include terms</span>
            <input name="include_terms" placeholder="Victor Wembanyama, Wemby" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Exclude terms</span>
            <input name="exclude_terms" placeholder="break, spot, case" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          </label>

          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Brand</span>
            <input name="brand" placeholder="Panini" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Product line / set</span>
            <input name="product_line" placeholder="Prizm" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          </label>

          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Season</span>
            <input name="season" placeholder="2023-24" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Card number</span>
            <input name="card_number" placeholder="136" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          </label>

          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Parallel</span>
            <input name="parallel" placeholder="Silver" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Minimum confidence</span>
            <input name="minimum_match_confidence" type="number" min="0" max="1" step="0.05" defaultValue="0.75" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          </label>

          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Min price</span>
            <input name="min_price" type="number" min="0" step="0.01" placeholder="0" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Max price</span>
            <input name="max_price" type="number" min="0" step="0.01" placeholder="250" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          </label>
        </div>

        <fieldset className="mt-6">
          <legend className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Optional constraints
          </legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {[
              ["rookie_only", "Rookie only"],
              ["autograph_only", "Autographs"],
              ["relic_only", "Relics"],
              ["serial_numbered_only", "Serial numbered"],
              ["graded_only", "Graded"],
              ["raw_only", "Raw"],
            ].map(([name, label]) => (
              <label key={name} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-text-muted">
                <input name={name} type="checkbox" className="accent-[var(--color-accent)]" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-bg/45 p-4 text-sm text-text-muted">
          <input name="notification_enabled" type="checkbox" className="mt-1 accent-[var(--color-accent)]" />
          <span>
            <span className="block font-mono text-[10px] uppercase tracking-wider text-text">Email alerts</span>
            <span className="mt-1 block leading-6">
              Email me when CardAlarm finds a new card for this watchlist. You can turn this on later.
            </span>
          </span>
        </label>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button type="submit" className="rounded-full bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover">
            Create Watchlist
          </button>
          <Link href="/watchlists" className="rounded-full border border-border px-6 py-3 text-center font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
