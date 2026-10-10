import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { countUserSavedCards, getUserSavedCards } from "@/lib/queries";
import { DEFAULT_PAGE_SIZE, pageHref, pageOffset, pageWindow, parsePage } from "@/lib/pagination";
import { ListingCard } from "../components/listing-card";
import { PaginationNav } from "../components/pagination-nav";

export const dynamic = "force-dynamic";

interface SavedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SavedPage({ searchParams }: SavedPageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const pageSize = DEFAULT_PAGE_SIZE;
  const currentPage = parsePage(params.page);
  const offset = pageOffset(currentPage, pageSize);

  const [savedCards, total] = await Promise.all([
    getUserSavedCards(user.id, { limit: pageSize, offset }),
    countUserSavedCards(user.id),
  ]);

  const pager = pageWindow(total, currentPage, pageSize);
  if (total > 0 && currentPage > pager.pageCount) {
    redirect(pageHref("/saved", {}, pager.pageCount));
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-text">Saved</h1>
          <p className="mt-1 text-[0.875rem] text-text-muted">
            <span className="data text-text">{total}</span> saved {total === 1 ? "card" : "cards"}. Saved cards stay
            here while they&apos;re still in stock.
          </p>
        </div>
        <Link href="/dashboard" className="link hidden shrink-0 text-[0.8125rem] sm:inline">
          Back to For You
        </Link>
      </header>

      {savedCards.length === 0 ? (
        <div className="panel px-5 py-10 md:px-10 md:py-14 md:text-center">
          <h2 className="section-title text-text">No saved cards yet</h2>
          <p className="mt-2 max-w-md text-text-muted md:mx-auto">Tap Save on any card in For You to keep it here.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row md:justify-center">
            <Link href="/dashboard" className="btn btn-primary">
              Go to For You
            </Link>
          </div>
        </div>
      ) : (
        <div className={CARD_GRID}>
          {savedCards.map((listing) => (
            <ListingCard key={listing.id} listing={listing} showFeedbackControls />
          ))}
        </div>
      )}

      <PaginationNav window={pager} basePath="/saved" params={{}} noun="saved cards" />
    </div>
  );
}

// Shared card grid (dashboard, saved, loading): max 4 columns.
const CARD_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 xl:gap-5";
