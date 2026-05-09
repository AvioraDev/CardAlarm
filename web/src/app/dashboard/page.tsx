import { Suspense } from "react";
import Link from "next/link";
import {
  getActiveFeed,
  getFeedStats,
  getFilterFacets,
  getLatestScanRun,
  getActiveUserWatchlistChips,
  getUserWatchlistFeed,
  getUserWatchlistStats,
} from "@/lib/queries";
import { requireUser } from "@/lib/auth";
import type { FeedStats, FilterFacets, FilterOptions, ListingRow } from "@/lib/types";
import { ListingCard } from "../components/listing-card";
import { FilterBar } from "../components/filter-bar";

// Force dynamic rendering — feed changes with every engine cycle
export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const mode = params.mode === "all" ? "all" : "matches";
  const isBrowseAll = mode === "all";
  const pageSize = 48;
  const currentPage = Math.max(
    Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1,
    1,
  );

  // Extract filters from URL search params
  const filters: FilterOptions = {
    source: typeof params.source === "string" ? params.source : undefined,
    watchlistId: typeof params.watchlistId === "string" ? params.watchlistId : undefined,
    year: typeof params.year === "string" ? params.year : undefined,
    setName: typeof params.setName === "string" ? params.setName : undefined,
    player: typeof params.player === "string" ? params.player : undefined,
    team: typeof params.team === "string" ? params.team : undefined,
    variant: typeof params.variant === "string" ? params.variant : undefined,
    matchType: typeof params.matchType === "string" ? params.matchType : undefined,
    matchStatus: typeof params.matchStatus === "string" ? params.matchStatus : undefined,
    category: typeof params.category === "string" ? params.category : undefined,
    isSerial: typeof params.isSerial === "string" ? params.isSerial : undefined,
    isAuto: typeof params.isAuto === "string" ? params.isAuto : undefined,
    isRookie: typeof params.isRookie === "string" ? params.isRookie : undefined,
    watchlistOnly: typeof params.watchlistOnly === "string" ? params.watchlistOnly : undefined,
    priceMin: typeof params.priceMin === "string" ? params.priceMin : undefined,
    priceMax: typeof params.priceMax === "string" ? params.priceMax : undefined,
    search: typeof params.search === "string" ? params.search : undefined,
  };

  // Strip undefined values
  const cleanFilters = Object.fromEntries(
    Object.entries(filters).filter(([key, value]) => {
      if (isBrowseAll && ["watchlistOnly", "watchlistId", "team", "matchStatus"].includes(key)) return false;
      if (!isBrowseAll && ["watchlistOnly", "matchType", "category", "setName"].includes(key)) return false;
      return value !== undefined && value !== "";
    })
  ) as FilterOptions;
  const nonWatchlistFilters = Object.fromEntries(
    Object.entries(cleanFilters).filter(([key]) => key !== "watchlistId")
  ) as FilterOptions;
  const hasNonWatchlistFilters = Object.keys(nonWatchlistFilters).length > 0;
  const selectedWatchlistId = cleanFilters.watchlistId;

  const [scanRun, watchlistFeed, watchlistStats, unfilteredWatchlistStats, watchlistChips] = await Promise.all([
    getLatestScanRun(),
    isBrowseAll ? Promise.resolve([]) : getUserWatchlistFeed(user.id, cleanFilters),
    getUserWatchlistStats(user.id, isBrowseAll ? {} : cleanFilters),
    getUserWatchlistStats(user.id),
    getActiveUserWatchlistChips(user.id),
  ]);
  const emptyStats: FeedStats = { total: 0, direct: 0, stealth: 0, confirmed: 0, possible: 0, serialized: 0 };
  const emptyFacets: FilterFacets = { sources: [], years: [], setNames: [], players: [], variants: [], categories: [] };
  let allFeed: ListingRow[] = [];
  let allStats = emptyStats;
  let unfilteredStats = emptyStats;
  let facets = emptyFacets;

  if (isBrowseAll) {
    [allFeed, allStats, unfilteredStats, facets] = await Promise.all([
      getActiveFeed(cleanFilters, { limit: pageSize, offset: (currentPage - 1) * pageSize }),
      getFeedStats(cleanFilters),
      Object.keys(cleanFilters).length > 0 ? getFeedStats() : getFeedStats(cleanFilters),
      getFilterFacets(),
    ]);
  }
  if (!isBrowseAll) {
    facets = await getFilterFacets();
  }
  const feed = isBrowseAll ? allFeed : watchlistFeed;
  const stats = isBrowseAll
    ? {
        total: allStats.total,
        current: allStats.confirmed,
        possible: allStats.possible,
        watchlists: watchlistStats.watchlists,
        serialized: allStats.serialized,
      }
    : watchlistStats;
  const pageCount = isBrowseAll ? Math.max(Math.ceil(stats.total / pageSize), 1) : 1;
  const pageStart = isBrowseAll && stats.total > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = isBrowseAll ? Math.min(currentPage * pageSize, stats.total) : feed.length;

  function pageHref(page: number): string {
    const nextParams = new URLSearchParams();
    nextParams.set("mode", "all");
    for (const [key, value] of Object.entries(cleanFilters)) {
      if (value) nextParams.set(key, value);
    }
    if (page > 1) nextParams.set("page", String(page));
    return `/dashboard?${nextParams.toString()}`;
  }

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
    if (isBrowseAll) return "No cached listings yet";
    if (hasNonWatchlistFilters) return "No watchlist matches for these filters";
    if (selectedWatchlistId) return "No matches for this watchlist yet";
    if (unfilteredWatchlistStats.total === 0) return "No watchlist matches yet";
    return "No watchlist matches for these filters";
  })();

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
              CardAlarm
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text md:text-4xl">
              {isBrowseAll ? "Browse all cached listings" : "My watchlist matches"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              {isBrowseAll
                ? "Explore currently available cached store products from the latest scans. This is not your watchlist and does not include unavailable historical products."
                : "Your dashboard defaults to cards matched against your active watchlists. Add or refresh watchlists to backfill against cached store inventory."}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-bg/60 px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-text-muted">
            {scanRun?.completed_at
              ? `Last scan ${new Date(scanRun.completed_at).toLocaleString()}`
              : "No completed scan yet"}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className={`rounded-full px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
              isBrowseAll ? "border border-border text-text-muted hover:border-accent hover:text-text" : "bg-accent text-bg"
            }`}
          >
            My Matches
          </Link>
          <Link
            href="/dashboard?mode=all"
            className={`rounded-full px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
              isBrowseAll ? "bg-accent text-bg" : "border border-border text-text-muted hover:border-accent hover:text-text"
            }`}
          >
            Browse All
          </Link>
        </div>
        <Link href="/watchlists/new" className="font-mono text-xs uppercase tracking-wider text-accent hover:underline">
          Add watchlist
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="metric-card">
          <p className="metric-label">
            {isBrowseAll ? "Current Cached" : "My Matches"}
          </p>
          <p className="metric-value">
            {stats.total}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label text-direct">
            Current
          </p>
          <p className="metric-value text-direct">
            {stats.current}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label text-stealth">
            Possible
          </p>
          <p className="metric-value text-stealth">
            {stats.possible}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label">
            Watchlists
          </p>
          <p className="metric-value">
            {stats.watchlists}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label">
            Serialized
          </p>
          <p className="metric-value">
            {stats.serialized}
          </p>
        </div>
      </div>

      {isBrowseAll ? (
        <div className="space-y-3">
          <Suspense fallback={null}>
            <FilterBar
              facets={facets}
              activeFilters={cleanFilters}
              totalUnfiltered={unfilteredStats.total}
              totalFiltered={stats.total}
            />
          </Suspense>
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} of{" "}
              {stats.total.toLocaleString()} currently available cached products.
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider">
              Page {currentPage} of {pageCount}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-text">
                  Watchlists
                </h2>
                <p className="mt-1 text-xs text-text-muted">
                  Switch inbox context without leaving the dashboard.
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
                <span className="ml-2 text-[10px] opacity-70">{unfilteredWatchlistStats.total}</span>
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
              totalUnfiltered={unfilteredWatchlistStats.total}
              totalFiltered={stats.total}
              variant="matches"
            />
          </Suspense>
        </div>
      )}

      {/* Feed Grid */}
      {feed.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
          <p className="text-lg font-semibold text-text">
            {emptyTitle}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
            {isBrowseAll
              ? "Run a store scan to populate cached listings, then browse all current inventory here."
              : "Create a watchlist and CardAlarm will immediately backfill it against cached store inventory."}
          </p>
          {!isBrowseAll ? (
            <Link
              href="/watchlists/new"
              className="mt-6 inline-flex rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg hover:bg-accent-hover"
            >
              Create Watchlist
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {feed.map((listing) => (
            <ListingCard key={listing.id} listing={listing} allowDismiss={false} />
          ))}
        </div>
      )}

      {isBrowseAll && pageCount > 1 ? (
        <nav className="flex items-center justify-between rounded-3xl border border-border bg-card p-3 shadow-card">
          {currentPage > 1 ? (
            <Link
              href={pageHref(currentPage - 1)}
              className="rounded-full border border-border px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-text-muted transition-colors hover:border-accent hover:text-text"
            >
              Previous
            </Link>
          ) : (
            <span className="rounded-full border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-text-muted/40">
              Previous
            </span>
          )}
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            48 per page
          </span>
          {currentPage < pageCount ? (
            <Link
              href={pageHref(currentPage + 1)}
              className="rounded-full border border-border px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-text-muted transition-colors hover:border-accent hover:text-text"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-full border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-text-muted/40">
              Next
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}

