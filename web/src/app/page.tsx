import { Suspense } from "react";
import { getActiveFeed, getFeedStats, getFilterFacets, getLatestScanRun } from "@/lib/queries";
import type { FilterOptions } from "@/lib/types";
import { ListingCard } from "./components/listing-card";
import { FilterBar } from "./components/filter-bar";
import { ScanPanel } from "./components/scan-panel";

// Force dynamic rendering — feed changes with every engine cycle
export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;

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

  const feed = getActiveFeed(cleanFilters);
  const stats = getFeedStats(cleanFilters);
  const unfilteredStats = Object.keys(cleanFilters).length > 0
    ? getFeedStats()
    : stats;
  const facets = getFilterFacets();
  const scanRun = getLatestScanRun();

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
              CardAlarm
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text md:text-4xl">
              Current card matches
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Cached store inventory matched against your watchlist. Review confidence,
              reasons, price, and source before clicking through.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-bg/60 px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-text-muted">
            {scanRun?.completed_at
              ? `Last scan ${new Date(scanRun.completed_at).toLocaleString()}`
              : "No completed scan yet"}
          </div>
        </div>
      </section>

      <ScanPanel initialScanRun={scanRun} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="metric-card">
          <p className="metric-label">
            Active
          </p>
          <p className="metric-value">
            {stats.total}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label text-direct">
            Confirmed
          </p>
          <p className="metric-value text-direct">
            {stats.confirmed}
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
            Stealth
          </p>
          <p className="metric-value">
            {stats.stealth}
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

      <Suspense fallback={null}>
        <FilterBar
          facets={facets}
          activeFilters={cleanFilters}
          totalUnfiltered={unfilteredStats.total}
          totalFiltered={stats.total}
        />
      </Suspense>

      {/* Feed Grid */}
      {feed.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
          <p className="text-lg font-semibold text-text">
            {Object.keys(cleanFilters).length > 0
              ? "No matches for these filters"
              : "No current matches yet"}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
            {Object.keys(cleanFilters).length > 0
              ? "Clear or loosen filters to see more cached inventory matches."
              : "Add a watchlist target, then scan cached stores. CardAlarm will show high-confidence matches here."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {feed.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
