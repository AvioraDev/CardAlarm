import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getActiveUserWatchlistChips,
  getUserWatchlistFilterFacets,
  getUserWatchlistFeed,
  getUserWatchlistStats,
} from "@/lib/queries";
import { ensureProfile, requireUser } from "@/lib/auth";
import type { FilterOptions } from "@/lib/types";
import { refreshAllUserWatchlistsAction } from "@/lib/watchlist-actions";
import { ListingCard } from "../components/listing-card";
import { FilterBar } from "../components/filter-bar";

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireUser();
  const profile = await ensureProfile(user.id, user.email);
  const params = await searchParams;

  if (params.mode === "all") {
    redirect(profile.role === "admin" ? "/admin/inventory" : "/dashboard");
  }

  const filters: FilterOptions = {
    source: typeof params.source === "string" ? params.source : undefined,
    watchlistId: typeof params.watchlistId === "string" ? params.watchlistId : undefined,
    year: typeof params.year === "string" ? params.year : undefined,
    player: typeof params.player === "string" ? params.player : undefined,
    team: typeof params.team === "string" ? params.team : undefined,
    variant: typeof params.variant === "string" ? params.variant : undefined,
    matchStatus: typeof params.matchStatus === "string" ? params.matchStatus : undefined,
    isSerial: typeof params.isSerial === "string" ? params.isSerial : undefined,
    isAuto: typeof params.isAuto === "string" ? params.isAuto : undefined,
    isRookie: typeof params.isRookie === "string" ? params.isRookie : undefined,
    priceMin: typeof params.priceMin === "string" ? params.priceMin : undefined,
    priceMax: typeof params.priceMax === "string" ? params.priceMax : undefined,
    search: typeof params.search === "string" ? params.search : undefined,
  };

  const cleanFilters = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== "")
  ) as FilterOptions;
  const nonWatchlistFilters = Object.fromEntries(
    Object.entries(cleanFilters).filter(([key]) => key !== "watchlistId")
  ) as FilterOptions;
  const hasNonWatchlistFilters = Object.keys(nonWatchlistFilters).length > 0;
  const selectedWatchlistId = cleanFilters.watchlistId;

  const [feed, stats, unfilteredStats, watchlistChips, facets] = await Promise.all([
    getUserWatchlistFeed(user.id, cleanFilters),
    getUserWatchlistStats(user.id, cleanFilters),
    getUserWatchlistStats(user.id),
    getActiveUserWatchlistChips(user.id),
    getUserWatchlistFilterFacets(user.id, cleanFilters),
  ]);

  function matchesHref(nextWatchlistId?: string): string {
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(cleanFilters)) {
      if (key !== "watchlistId" && value) nextParams.set(key, value);
    }
    if (nextWatchlistId) nextParams.set("watchlistId", nextWatchlistId);
    const query = nextParams.toString();
    return query ? `/dashboard?${query}` : "/dashboard";
  }

  const emptyTitle = (() => {
    if (feed.length > 0) return "";
    if (hasNonWatchlistFilters) return "No cards found for these filters";
    if (selectedWatchlistId) return "No cards found for this watchlist yet";
    if (unfilteredStats.total === 0) return "No cards found for you yet";
    return "No cards found for these filters";
  })();

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
              Cards found for you
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text md:text-4xl">
              For You
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              CardAlarm watches your active watchlists and brings matching cards here when they are available now.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <form action={refreshAllUserWatchlistsAction}>
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-full border border-border px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent sm:w-auto"
                title="Re-check available cards against every active watchlist."
              >
                Refresh Matches
              </button>
            </form>
            <Link
              href="/watchlists/new"
              className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
            >
              Create Watchlist
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="metric-card">
          <p className="metric-label">Found Cards</p>
          <p className="metric-value">{stats.total}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label text-direct">Available Now</p>
          <p className="metric-value text-direct">{stats.current}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label text-stealth">Possible</p>
          <p className="metric-value text-stealth">{stats.possible}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Watchlists</p>
          <p className="metric-value">{stats.watchlists}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Numbered</p>
          <p className="metric-value">{stats.serialized}</p>
        </div>
      </div>

      <div className="space-y-3">
        <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-text">
                Watchlists
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Switch between the cards CardAlarm found for each chase list.
              </p>
            </div>
            <Link href="/watchlists" className="font-mono text-[10px] uppercase tracking-wider text-accent hover:underline">
              Manage
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Link
              href={matchesHref()}
              className={`shrink-0 rounded-full px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                !selectedWatchlistId ? "bg-accent text-bg" : "border border-border text-text-muted hover:border-accent hover:text-text"
              }`}
            >
              All Watchlists
              <span className="ml-2 text-[10px] opacity-70">{unfilteredStats.total}</span>
            </Link>
            {watchlistChips.map((watchlist) => {
              const isSelected = selectedWatchlistId === String(watchlist.id);
              return (
                <Link
                  key={watchlist.id}
                  href={matchesHref(String(watchlist.id))}
                  className={`shrink-0 rounded-full px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                    isSelected ? "bg-accent text-bg" : "border border-border text-text-muted hover:border-accent hover:text-text"
                  }`}
                >
                  {watchlist.name}
                  <span className="ml-2 text-[10px] opacity-70">{watchlist.match_count}</span>
                </Link>
              );
            })}
          </div>
        </section>
        <Suspense fallback={null}>
          <FilterBar
            facets={facets}
            activeFilters={cleanFilters}
            totalUnfiltered={unfilteredStats.total}
            totalFiltered={stats.total}
            variant="matches"
          />
        </Suspense>
      </div>

      {feed.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
          <p className="text-lg font-semibold text-text">{emptyTitle}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
            Create or refine a watchlist and CardAlarm will surface matching cards here when they are found.
          </p>
          <Link
            href="/watchlists/new"
            className="mt-6 inline-flex rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg hover:bg-accent-hover"
          >
            Create Watchlist
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {feed.map((listing) => (
            <ListingCard key={listing.id} listing={listing} showFeedbackControls />
          ))}
        </div>
      )}
    </div>
  );
}
