import { Suspense } from "react";
import Link from "next/link";
import {
  getActiveFeed,
  getFeedStats,
  getFilterFacets,
  getLatestScanRun,
  getUserWatchlistFeed,
  getUserWatchlistStats,
} from "@/lib/queries";
import { getCurrentProfile, requireUser } from "@/lib/auth";
import type { FilterOptions } from "@/lib/types";
import { ListingCard } from "../components/listing-card";
import { FilterBar } from "../components/filter-bar";
import { ScanPanel } from "../components/scan-panel";

// Force dynamic rendering — feed changes with every engine cycle
export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireUser();
  const profile = await getCurrentProfile();
  const params = await searchParams;
  const mode = params.mode === "all" ? "all" : "matches";
  const isBrowseAll = mode === "all";

  // Extract filters from URL search params
  const filters: FilterOptions = {
    year: typeof params.year === "string" ? params.year : undefined,
    setName: typeof params.setName === "string" ? params.setName : undefined,
    player: typeof params.player === "string" ? params.player : undefined,
    variant: typeof params.variant === "string" ? params.variant : undefined,
    matchType: typeof params.matchType === "string" ? params.matchType : undefined,
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
    Object.entries(filters).filter(([, v]) => v !== undefined)
  ) as FilterOptions;

  const [allFeed, allStats, unfilteredStats, facets, scanRun, watchlistFeed, watchlistStats] = await Promise.all([
    getActiveFeed(cleanFilters),
    getFeedStats(cleanFilters),
    Object.keys(cleanFilters).length > 0 ? getFeedStats() : getFeedStats(cleanFilters),
    getFilterFacets(),
    getLatestScanRun(),
    getUserWatchlistFeed(user.id),
    getUserWatchlistStats(user.id),
  ]);
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
                ? "Explore all current cached store listings. These are not necessarily on your watchlist."
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

      {profile?.role === "admin" ? <ScanPanel initialScanRun={scanRun} /> : null}

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
            {isBrowseAll ? "All Active" : "My Matches"}
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
        <Suspense fallback={null}>
          <FilterBar
            facets={facets}
            activeFilters={cleanFilters}
            totalUnfiltered={unfilteredStats.total}
            totalFiltered={stats.total}
          />
        </Suspense>
      ) : null}

      {/* Feed Grid */}
      {feed.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
          <p className="text-lg font-semibold text-text">
            {Object.keys(cleanFilters).length > 0
              ? "No matches for these filters"
              : isBrowseAll
                ? "No cached listings yet"
                : "No watchlist matches yet"}
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
            <ListingCard key={listing.id} listing={listing} allowDismiss={isBrowseAll} />
          ))}
        </div>
      )}
    </div>
  );
}

