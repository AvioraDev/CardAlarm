import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveFeed, getFeedStats, getFilterFacets } from "@/lib/queries";
import type { FilterOptions } from "@/lib/types";
import { FilterBar } from "../../components/filter-bar";
import { ListingCard } from "../../components/listing-card";

export const dynamic = "force-dynamic";

interface AdminInventoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminInventoryPage({ searchParams }: AdminInventoryPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const pageSize = 48;
  const currentPage = Math.max(
    Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1,
    1,
  );
  const filters: FilterOptions = {
    source: typeof params.source === "string" ? params.source : undefined,
    year: typeof params.year === "string" ? params.year : undefined,
    setName: typeof params.setName === "string" ? params.setName : undefined,
    player: typeof params.player === "string" ? params.player : undefined,
    variant: typeof params.variant === "string" ? params.variant : undefined,
    matchType: typeof params.matchType === "string" ? params.matchType : undefined,
    category: typeof params.category === "string" ? params.category : undefined,
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

  const [feed, stats, unfilteredStats, facets] = await Promise.all([
    getActiveFeed(cleanFilters, { limit: pageSize, offset: (currentPage - 1) * pageSize }),
    getFeedStats(cleanFilters),
    Object.keys(cleanFilters).length > 0 ? getFeedStats() : getFeedStats(cleanFilters),
    getFilterFacets(),
  ]);

  const pageCount = Math.max(Math.ceil(stats.total / pageSize), 1);
  const pageStart = stats.total > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, stats.total);

  function pageHref(page: number): string {
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(cleanFilters)) {
      if (value) nextParams.set(key, value);
    }
    if (page > 1) nextParams.set("page", String(page));
    const query = nextParams.toString();
    return query ? `/admin/inventory?${query}` : "/admin/inventory";
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
        <Link href="/admin" className="font-mono text-xs uppercase tracking-wider text-text-muted hover:text-accent">
          ← Admin
        </Link>
        <p className="mt-5 font-mono text-xs uppercase tracking-[0.24em] text-accent">
          Inventory
        </p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text md:text-4xl">
              Scanned product inventory
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
              Admin-only QA view of products currently available from scanned stores.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-bg/60 px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-text-muted">
            {stats.total.toLocaleString()} available
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="metric-card">
          <p className="metric-label">Inventory</p>
          <p className="metric-value">{stats.total}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label text-direct">Matched</p>
          <p className="metric-value text-direct">{stats.direct}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label text-stealth">Unmatched</p>
          <p className="metric-value text-stealth">{stats.stealth}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Possible</p>
          <p className="metric-value">{stats.possible}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Numbered</p>
          <p className="metric-value">{stats.serialized}</p>
        </div>
      </div>

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
            {stats.total.toLocaleString()} available products.
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider">
            Page {currentPage} of {pageCount}
          </span>
        </div>
      </div>

      {feed.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
          <p className="text-lg font-semibold text-text">No inventory found</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
            Adjust filters or review scan status under Admin Scans.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {feed.map((listing) => (
            <ListingCard key={listing.id} listing={listing} allowDismiss={false} />
          ))}
        </div>
      )}

      {pageCount > 1 ? (
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
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">48 per page</span>
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
