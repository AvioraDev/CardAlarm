import { SubmitButton } from "@/app/components/submit-button";
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
import type { FilterOptions, ListingRow } from "@/lib/types";
import { refreshAllUserWatchlistsAction } from "@/lib/watchlist-actions";
import { DEFAULT_PAGE_SIZE, pageHref, pageOffset, pageWindow, parsePage } from "@/lib/pagination";
import { ListingCard } from "../components/listing-card";
import { FilterBar } from "../components/filter-bar";
import { PaginationNav } from "../components/pagination-nav";

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

  const pageSize = DEFAULT_PAGE_SIZE;
  const currentPage = parsePage(params.page);
  const offset = pageOffset(currentPage, pageSize);
  const hasAnyFilter = Object.keys(cleanFilters).length > 0;
  const statsPromise = getUserWatchlistStats(user.id, cleanFilters);

  const [feed, stats, unfilteredStats, watchlistChips, facets] = await Promise.all([
    getUserWatchlistFeed(user.id, cleanFilters, { limit: pageSize, offset }),
    statsPromise,
    hasAnyFilter ? getUserWatchlistStats(user.id) : statsPromise,
    getActiveUserWatchlistChips(user.id),
    getUserWatchlistFilterFacets(user.id, cleanFilters),
  ]);

  const pager = pageWindow(stats.total, currentPage, pageSize);
  const hrefParams = { ...cleanFilters } as Record<string, string | undefined>;
  if (stats.total > 0 && currentPage > pager.pageCount) {
    redirect(pageHref("/dashboard", hrefParams, pager.pageCount));
  }

  const confirmedOnPage = feed.filter((listing) => listing.match_status !== "possible");
  const possibleOnPage = feed.filter((listing) => listing.match_status === "possible");
  const isFirstRun = watchlistChips.length === 0;
  const selectedWatchlist = selectedWatchlistId
    ? watchlistChips.find((watchlist) => String(watchlist.id) === selectedWatchlistId)
    : undefined;

  // Never includes `page`, so switching watchlist always starts at page 1.
  function matchesHref(nextWatchlistId?: string): string {
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(cleanFilters)) {
      if (key !== "watchlistId" && value) nextParams.set(key, value);
    }
    if (nextWatchlistId) nextParams.set("watchlistId", nextWatchlistId);
    const query = nextParams.toString();
    return query ? `/dashboard?${query}` : "/dashboard";
  }

  // Drops every filter but keeps the selected watchlist.
  const clearFiltersHref = selectedWatchlistId
    ? `/dashboard?${new URLSearchParams({ watchlistId: selectedWatchlistId }).toString()}`
    : "/dashboard";

  // Empty-state causes, checked in order; the fallback reuses the filters copy.
  const emptyCause: "filters" | "watchlist" | "none-yet" = hasNonWatchlistFilters
    ? "filters"
    : selectedWatchlistId
      ? "watchlist"
      : unfilteredStats.total === 0
        ? "none-yet"
        : "filters";

  const emptyTitle = (() => {
    if (feed.length > 0) return "";
    if (emptyCause === "watchlist") return `Nothing found for ${selectedWatchlist?.name ?? "this watchlist"} yet`;
    if (emptyCause === "none-yet") return "No cards found for you yet";
    return "No cards match these filters";
  })();

  function renderEmptyState() {
    if (emptyCause === "filters") {
      return (
        <EmptyState
          title={emptyTitle}
          body="Try removing a filter or two. Your watchlists are still being checked."
          actions={
            <Link href={clearFiltersHref} className="btn btn-primary">
              Clear filters
            </Link>
          }
        />
      );
    }
    if (emptyCause === "watchlist") {
      return (
        <EmptyState
          title={emptyTitle}
          body="We've checked the latest store inventory and haven't found a match. Broader watchlists, like a player on their own, find more cards."
          actions={
            <>
              <Link
                href={selectedWatchlist ? `/watchlists/${selectedWatchlist.id}` : "/watchlists"}
                className="btn btn-primary"
              >
                Edit this watchlist
              </Link>
              <Link href={matchesHref()} className="btn btn-secondary">
                See all watchlists
              </Link>
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        title={emptyTitle}
        body="We've checked the latest store inventory for your watchlists and haven't found a match yet. Stores are checked regularly, and new matches will appear here as soon as they turn up."
        actions={
          <>
            <Link href="/watchlists/new?quick=1" className="btn btn-primary">
              Add another watchlist
            </Link>
            <Link href="/watchlists" className="btn btn-secondary">
              Review your watchlists
            </Link>
          </>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text md:text-3xl">For You</h1>
          {!isFirstRun ? (
            <p className="mt-1 text-sm text-text-muted">
              Cards found for you: <span className="data text-text">{stats.total}</span> ·{" "}
              <span className="data text-confirmed">{stats.current}</span> confirmed ·{" "}
              <span className="data text-possible">{stats.possible}</span> possible
              {hasNonWatchlistFilters ? (
                <>
                  {" "}
                  (filtered from <span className="data">{unfilteredStats.total}</span>)
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        {!isFirstRun ? (
          <div className="flex gap-2">
            <form action={refreshAllUserWatchlistsAction}>
              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Refreshing…">
                Refresh matches
              </SubmitButton>
            </form>
            <Link href="/watchlists/new?quick=1" className="btn btn-secondary btn-sm">
              New watchlist
            </Link>
          </div>
        ) : null}
      </header>

      {isFirstRun ? (
        <FirstRunPanel />
      ) : (
        <>
          <nav aria-label="Watchlists" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <Link href={matchesHref()} className="chip" aria-current={!selectedWatchlistId ? "page" : undefined}>
              All watchlists <span className="data text-xs opacity-75">{unfilteredStats.total}</span>
            </Link>
            {watchlistChips.map((watchlist) => {
              const isSelected = selectedWatchlistId === String(watchlist.id);
              return (
                <Link
                  key={watchlist.id}
                  href={matchesHref(String(watchlist.id))}
                  className="chip"
                  aria-current={isSelected ? "page" : undefined}
                >
                  {watchlist.name} <span className="data text-xs opacity-75">{watchlist.match_count}</span>
                </Link>
              );
            })}
            <Link href="/watchlists" className="btn btn-ghost btn-sm shrink-0">
              Manage
            </Link>
          </nav>

          <Suspense fallback={null}>
            <FilterBar
              facets={facets}
              activeFilters={cleanFilters}
              totalUnfiltered={unfilteredStats.total}
              totalFiltered={stats.total}
              variant="matches"
            />
          </Suspense>

          {feed.length === 0 ? (
            renderEmptyState()
          ) : (
            <>
              {confirmedOnPage.length > 0 ? (
                <section aria-labelledby="confirmed-heading">
                  <h2
                    id="confirmed-heading"
                    className={possibleOnPage.length > 0 ? "mb-3 text-base font-semibold text-text" : "sr-only"}
                  >
                    Confirmed matches
                  </h2>
                  <CardGrid listings={confirmedOnPage} eagerCount={2} />
                </section>
              ) : null}
              {possibleOnPage.length > 0 ? (
                <section aria-labelledby="possible-heading" className="space-y-3 pt-4">
                  <div className="rounded-2xl border border-dashed border-possible/40 bg-possible/5 p-4">
                    <h2 id="possible-heading" className="text-base font-semibold text-text">
                      Possible matches
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-text-muted">
                      These listings may match your watchlist, but CardAlarm is less certain. Check them before relying on
                      them.
                    </p>
                  </div>
                  <CardGrid listings={possibleOnPage} />
                </section>
              ) : null}
            </>
          )}

          <PaginationNav window={pager} basePath="/dashboard" params={hrefParams} noun="cards" />
        </>
      )}
    </div>
  );
}

const GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

function CardGrid({ listings, eagerCount = 0 }: { listings: ListingRow[]; eagerCount?: number }) {
  return (
    <div className={GRID_CLASS}>
      {listings.map((listing, index) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          showFeedbackControls
          imageLoading={index < eagerCount ? "eager" : "lazy"}
        />
      ))}
    </div>
  );
}

function EmptyState({ title, body, actions }: { title: string; body: string; actions: React.ReactNode }) {
  return (
    <div className="panel px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">{body}</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">{actions}</div>
    </div>
  );
}

function FirstRunPanel() {
  return (
    <section aria-labelledby="first-run-heading" className="panel mx-auto max-w-2xl p-6 md:p-8">
      <p className="eyebrow">Welcome to CardAlarm</p>
      <h2 id="first-run-heading" className="mt-2 text-2xl font-semibold tracking-tight text-text">
        Who are you chasing?
      </h2>
      <p className="mt-3 text-sm leading-6 text-text-muted">
        Start with a player. CardAlarm will check the latest store inventory straight away and show any matching NBA
        singles here.
      </p>
      <ol className="mt-6 space-y-3">
        <li className="flex gap-3">
          <span className="data text-sm text-accent">1</span>
          <span className="text-sm text-text">Pick a player</span>
        </li>
        <li className="flex gap-3">
          <span className="data text-sm text-accent">2</span>
          <span className="text-sm text-text">
            Narrow it down if you like: rookies, autos, numbered cards or a price range
          </span>
        </li>
        <li className="flex gap-3">
          <span className="data text-sm text-accent">3</span>
          <span className="text-sm text-text">Matches appear here with the store, the price and how sure we are</span>
        </li>
      </ol>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/watchlists/new?quick=1" className="btn btn-primary">
          Pick a player
        </Link>
        <Link href="/watchlists/new" className="btn btn-secondary">
          Build a detailed watchlist
        </Link>
      </div>
    </section>
  );
}
