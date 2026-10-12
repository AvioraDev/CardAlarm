import Link from "next/link";
import { friendlyError } from "@/lib/friendly-error";
import { requireUser } from "@/lib/auth";
import type { WatchlistCatalogueOptionFilters } from "@/lib/catalogue-options";
import { getPlayerOption, getWatchlistCatalogueOptions, searchPlayerOptions } from "@/lib/catalogue-options";
import { createWatchlistAction } from "@/lib/watchlist-actions";
import { CatalogueRefineForm, WatchlistFormFields } from "../watchlist-form-fields";
import { QuickStartCreateFields, QuickStartPlayerPicker } from "./quick-start";

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
  const quick = (Array.isArray(params.quick) ? params.quick[0] : params.quick) === "1";
  // Looked up by id on its own, so any player can be chosen whatever the length of the list.
  const quickPlayer = selected.playerId ? await getPlayerOption(selected.playerId) : null;
  const searchText = queryText(params.q);
  const searchResults = quick && !quickPlayer && searchText && searchText.length >= 2 ? await searchPlayerOptions(searchText) : [];

  const errorBanner = error ? (
    <div role="alert" className="notice notice-error mt-5">
      {friendlyError(error)}
    </div>
  ) : null;

  if (quick) {
    return (
      <div className="mx-auto max-w-[30rem] space-y-5 md:space-y-6">
        <section className="panel p-6 md:p-8">
          <p className="eyebrow">New watchlist</p>
          {quickPlayer ? (
            <>
              <h1 className="page-title mt-2 text-text">
                Watch {quickPlayer.label}
              </h1>
              <p className="mt-3 text-text-muted">
                We&apos;ll show every {quickPlayer.label} card we find in stock. Narrow it down below if you only want certain cards.
              </p>
              {errorBanner}
              <form action={createWatchlistAction} className="mt-6">
                <QuickStartCreateFields player={quickPlayer} />
              </form>
              <div className="mt-5 flex flex-wrap gap-4 text-[0.875rem]">
                <Link href="/watchlists/new?quick=1" className="link">Change player</Link>
                <Link href={`/watchlists/new?playerId=${quickPlayer.id}`} className="link">More options</Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="page-title mt-2 text-text">Who are you chasing?</h1>
              <p className="mt-3 text-text-muted">
                Pick a player. You can narrow it down on the next step, or keep it broad to see every card we find.
              </p>
              {errorBanner}
              {selected.playerId ? (
                <p role="alert" className="mt-4 text-[0.875rem] text-danger">
                  We couldn&apos;t find that player. Search again below.
                </p>
              ) : null}
              <QuickStartPlayerPicker query={searchText} results={searchResults} />
            </>
          )}
        </section>
        <p className="text-[0.875rem] text-text-muted">
          Need more options?{" "}
          <Link href="/watchlists/new" className="link">Build a detailed watchlist</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 md:space-y-6">
      <section className="panel p-6 md:p-8">
        <p className="eyebrow">New watchlist</p>
        <h1 className="page-title mt-2 text-text">
          Build a watchlist
        </h1>
        <p className="mt-3 max-w-2xl text-text-muted">
          Keep it broad if you want all cards for a player or set. Add optional filters
          when you know the exact season, card number, parallel, or price range.
        </p>
        {errorBanner}
      </section>

      <CatalogueRefineForm action="/watchlists/new" options={catalogueOptions} selected={selected} />

      <form action={createWatchlistAction} className="panel p-6 md:p-8">
        <WatchlistFormFields
          options={catalogueOptions}
          selected={selected}
          submitLabel="Create watchlist"
          defaultName={quickPlayer?.label ?? null}
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Link href="/watchlists" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
