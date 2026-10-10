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
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text md:text-3xl">Saved</h1>
          <p className="mt-1 text-sm text-text-muted">
            <span className="data text-text">{total}</span> saved {total === 1 ? "card" : "cards"}. Saved cards stay
            here while they&apos;re still in stock.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className="btn btn-secondary btn-sm">
            Back to For You
          </Link>
        </div>
      </header>

      {savedCards.length === 0 ? (
        <div className="panel px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-text">No saved cards yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
            Tap Save on any card in For You to keep it here.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/dashboard" className="btn btn-primary">
              Go to For You
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {savedCards.map((listing) => (
            <ListingCard key={listing.id} listing={listing} showFeedbackControls />
          ))}
        </div>
      )}

      <PaginationNav window={pager} basePath="/saved" params={{}} noun="saved cards" />
    </div>
  );
}
