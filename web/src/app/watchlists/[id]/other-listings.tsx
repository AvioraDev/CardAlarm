import { Suspense } from "react";
import { CardImage } from "@/app/components/card-image";
import { IconExternal } from "@/app/components/icons";
import { getOtherListings } from "@/lib/other-listings";
import { OTHER_LISTINGS_LIMIT } from "@/lib/other-listings-sql";
import { cardImageSrc, cardImageSrcSet, formatPrice, safeListingHref } from "@/lib/match-display";

interface OtherListingsSectionProps {
  userId: string;
  watchlistId: number;
  playerName: string | null;
}

const PULSE = "animate-pulse motion-reduce:animate-none";

function Heading({ playerName }: { playerName: string | null }) {
  return (
    <>
      <h2 className="section-head text-text">Other listings for {playerName ?? "this player"}</h2>
      <p className="mt-1 max-w-2xl text-[0.875rem] text-text-muted">
        These listings name this player, but we couldn&apos;t tie them to a card in our checklists. They&apos;re shown exactly as the store describes them, and you won&apos;t get alerts for them.
      </p>
    </>
  );
}

function SectionLoading({ playerName }: { playerName: string | null }) {
  return (
    <section className="panel p-5 md:p-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading other listings…</span>
      <Heading playerName={playerName} />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-2 rounded-card border border-border bg-surface p-3">
            <div className={`aspect-[5/4] rounded-control bg-mat ${PULSE}`} />
            <div className={`h-4 w-3/4 rounded-[2px] bg-mat ${PULSE}`} />
            <div className={`h-3 w-1/3 rounded-[2px] bg-mat ${PULSE}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

async function SectionContent({ userId, watchlistId, playerName }: OtherListingsSectionProps) {
  let result: Awaited<ReturnType<typeof getOtherListings>>;
  try {
    result = await getOtherListings(userId, watchlistId);
  } catch (error) {
    console.error("Other listings failed to load", error instanceof Error ? error.message : error);
    return (
      <section className="panel p-5 md:p-6">
        <Heading playerName={playerName} />
        <div role="alert" className="notice notice-error mt-4">
          We couldn&apos;t load these listings just now. The rest of this page is unaffected. Try refreshing in a moment.
        </div>
      </section>
    );
  }

  const { listings, total } = result;
  return (
    <section className="panel p-5 md:p-6">
      <Heading playerName={playerName} />
      {listings.length === 0 ? (
        <p className="mt-4 text-text-muted">Nothing else has turned up for {playerName ?? "this player"} right now. We&apos;ll keep looking.</p>
      ) : (
        <>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => {
              const href = safeListingHref(listing.url);
              return (
                <li key={listing.id} className="overflow-hidden rounded-card border border-border bg-surface">
                  <CardImage
                    src={cardImageSrc(listing.image_url, 480)}
                    srcSet={cardImageSrcSet(listing.image_url)}
                    alt={listing.title}
                    fallbackPrimary="No photo"
                    fallbackSecondary={listing.store_name}
                  />
                  <div className="space-y-1 p-3">
                    {/* Store text is rendered only as React text. */}
                    <p className="line-clamp-3 text-[0.9375rem] text-text">{listing.title}</p>
                    <p className="text-[0.8125rem] text-text-muted">
                      <span className="data">{formatPrice(listing.price, listing.currency)}</span> · {listing.store_name}
                    </p>
                    {href === "#" ? null : (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-[0.8125rem]">
                        View at {listing.store_name} <IconExternal />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {total > OTHER_LISTINGS_LIMIT ? (
            <p className="mt-3 text-[0.8125rem] text-text-muted">Showing the {OTHER_LISTINGS_LIMIT} most recent of {total}.</p>
          ) : null}
        </>
      )}
    </section>
  );
}

export function OtherListingsSection(props: OtherListingsSectionProps) {
  return (
    <Suspense fallback={<SectionLoading playerName={props.playerName} />}>
      <SectionContent {...props} />
    </Suspense>
  );
}
