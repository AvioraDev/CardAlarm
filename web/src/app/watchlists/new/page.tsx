import Link from "next/link";
import { requireUser } from "@/lib/auth";
import type { WatchlistCatalogueOptionFilters } from "@/lib/catalogue-options";
import { getWatchlistCatalogueOptions } from "@/lib/catalogue-options";
import { createWatchlistAction } from "@/lib/watchlist-actions";
import { CatalogueRefineForm, WatchlistFormFields } from "../watchlist-form-fields";

interface NewWatchlistPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function positiveQueryId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

function queryText(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed || null;
}

export default async function NewWatchlistPage({ searchParams }: NewWatchlistPageProps) {
  await requireUser();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const selected: WatchlistCatalogueOptionFilters = {
    playerId: positiveQueryId(params.playerId),
    setId: positiveQueryId(params.setId),
    season: queryText(params.season),
    productLine: queryText(params.productLine),
  };
  const catalogueOptions = await getWatchlistCatalogueOptions(selected);

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

      <CatalogueRefineForm action="/watchlists/new" options={catalogueOptions} selected={selected} />

      <form action={createWatchlistAction} className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <WatchlistFormFields options={catalogueOptions} selected={selected} submitLabel="Create Watchlist" />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Link href="/watchlists" className="rounded-full border border-border px-6 py-3 text-center font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
