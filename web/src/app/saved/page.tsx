import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getUserSavedCards } from "@/lib/queries";
import { ListingCard } from "../components/listing-card";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const user = await requireUser();
  const savedCards = await getUserSavedCards(user.id);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
              Tracked cards
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text md:text-4xl">
              Saved
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Cards you saved from your watchlist matches stay here while they are still available.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent hover:text-accent"
          >
            Back to For You
          </Link>
        </div>
      </section>

      {savedCards.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
          <p className="text-lg font-semibold text-text">No saved cards yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
            Save cards from For You to keep track of the opportunities you want to revisit.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg hover:bg-accent-hover"
          >
            View For You
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {savedCards.map((listing) => (
            <ListingCard key={listing.id} listing={listing} showFeedbackControls />
          ))}
        </div>
      )}
    </div>
  );
}
