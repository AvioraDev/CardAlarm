import { CardImage } from "@/app/components/card-image";
import { IconCheck, IconExternal, IconPossible } from "@/app/components/icons";
import { SubmitButton } from "@/app/components/submit-button";
import { dismissCardAction, notMatchCardAction, saveCardAction, unsaveCardAction } from "@/lib/actions";
import {
  cardAltText,
  cardImageSrc,
  cardImageSrcSet,
  confidencePercent,
  customerReasons,
  formatCheckedAgo,
  formatPrice,
  matchTier,
  safeListingHref,
  tierLabel,
  type MatchTier,
} from "@/lib/match-display";
import type { ListingRow } from "@/lib/types";

interface ListingCardProps {
  listing: ListingRow;
  showFeedbackControls?: boolean;
  /** Landing-page example: inert links, "Example" badge, no feedback, no checked time. */
  preview?: boolean;
  /** The dashboard passes "eager" for the first cards above the fold. */
  imageLoading?: "lazy" | "eager";
}

function MatchBadge({ tier }: { tier: MatchTier }) {
  if (tier === "possible") {
    return (
      <span className="badge badge-possible">
        <IconPossible /> {tierLabel(tier)}
      </span>
    );
  }
  if (tier === "unmatched") {
    return <span className="badge badge-neutral">{tierLabel(tier)}</span>;
  }
  // "strong" and "confirmed" both read "Confirmed match"; the percentage carries the gradation.
  return (
    <span className="badge badge-confirmed">
      <IconCheck /> {tierLabel(tier)}
    </span>
  );
}

// Store-controlled text is rendered only as React text; URLs and images go through match-display sanitisers.
export function ListingCard({ listing, showFeedbackControls = false, preview = false, imageLoading }: ListingCardProps) {
  const tier = matchTier(listing.match_status, listing.match_confidence);
  const isPossible = tier === "possible";
  const pct = confidencePercent(listing.match_confidence);
  const reasons = customerReasons(listing.match_reasons, 2);
  const src = cardImageSrc(listing.image_url, 480);
  const srcSet = cardImageSrcSet(listing.image_url);
  const alt = cardAltText(listing);
  const href = safeListingHref(listing.url);
  const checked = formatCheckedAgo(listing.last_checked_at);
  const serialDisplay = listing.serial_current && listing.serial_limit
    ? `${listing.serial_current}/${listing.serial_limit}`
    : listing.serial_limit
      ? `/${listing.serial_limit}`
      : listing.serial_number;
  const primaryTitle = listing.player_name ?? "Unidentified card";
  // The card number is pulled out into the tag row as a catalogue reference.
  const detailLine = [listing.year, listing.set_name, listing.variant].filter(Boolean).join(" · ");
  const storeName = listing.store_name || listing.source;
  const showFeedback = showFeedbackControls && !preview;

  return (
    <article
      data-match-tier={tier}
      className={`group grid grid-cols-[6rem_1fr] gap-x-3 gap-y-3 overflow-hidden rounded-card border bg-surface p-3 sm:flex sm:flex-col sm:gap-0 sm:p-0 ${
        isPossible ? "card-possible" : "border-border hover:border-border-strong"
      }`}
    >
      <div className="relative">
        <CardImage
          src={src}
          srcSet={srcSet}
          alt={alt}
          fallbackPrimary={listing.card_number ? `#${listing.card_number}` : "No photo"}
          fallbackSecondary={listing.set_name ?? primaryTitle}
          fallbackNote={preview ? "Example card" : undefined}
          loading={imageLoading ?? "lazy"}
        />
        {preview ? <span className="badge badge-example absolute left-2 top-2">Example</span> : null}
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:px-4 sm:pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <MatchBadge tier={tier} />
          {pct ? (
            <span className="data text-[0.75rem] text-text-muted" aria-label={`${pct} match confidence`}>
              {pct}
            </span>
          ) : null}
        </div>
        <h3 className="card-title line-clamp-2 text-text">{primaryTitle}</h3>
        {detailLine ? (
          <p className="line-clamp-2 text-[0.8125rem] leading-[1.125rem] text-text-muted">{detailLine}</p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {listing.card_number ? <span className="tag ref">#{listing.card_number}</span> : null}
          {listing.is_serial && serialDisplay ? <span className="tag ref">{serialDisplay}</span> : null}
          {listing.is_serial && !serialDisplay ? <span className="tag">Numbered</span> : null}
          {listing.is_auto ? <span className="tag">Auto</span> : null}
          {listing.is_rookie ? <span className="tag">RC</span> : null}
          {listing.category && listing.category !== "NBA" ? <span className="tag">{listing.category}</span> : null}
        </div>
        <div className="mt-1 min-w-0 sm:border-t sm:border-border sm:pt-3">
          <p className="data text-[1.125rem] font-semibold leading-[1.375rem] text-text sm:text-[1.25rem] sm:leading-[1.5rem]">
            {formatPrice(listing.price, listing.currency)}
          </p>
          <p className="truncate text-[0.8125rem] font-medium text-text">{storeName}</p>
          {!preview && checked ? <p className="text-[0.75rem] text-text-muted">{checked}</p> : null}
        </div>
      </div>

      <div className="col-span-2 flex min-w-0 flex-col gap-2 sm:px-4 sm:pt-3">
        <p className="line-clamp-1 text-[0.75rem] text-text-muted" title={listing.title}>
          Listed as: {listing.title}
        </p>
        {reasons.length > 0 ? (
          <p className="line-clamp-2 text-[0.8125rem] leading-[1.125rem] text-text-muted">
            <span className="font-medium text-text">Why it matched:</span> {reasons.join(" · ")}
          </p>
        ) : null}
        {isPossible ? (
          <p className="text-[0.8125rem] leading-[1.125rem] text-possible">
            We&apos;re less sure about this one. Check the details before you buy.
          </p>
        ) : null}
      </div>

      <div className="col-span-2 flex flex-col gap-2 sm:mt-auto sm:p-4 sm:pt-3">
        <div className="flex gap-2">
          {preview ? (
            <span aria-disabled="true" className="btn btn-primary btn-sm flex-1">
              Open store <IconExternal />
            </span>
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm flex-1"
              aria-label={`Open store listing at ${storeName} (opens in a new tab)`}
            >
              Open store <IconExternal />
            </a>
          )}
          {showFeedback ? (
            <form action={listing.is_saved ? unsaveCardAction : saveCardAction}>
              <input type="hidden" name="storeProductId" value={listing.id} />
              {/* Saved is a pressed secondary button; the ink button is reserved for Open store. */}
              <SubmitButton
                className="btn btn-secondary btn-sm"
                aria-pressed={listing.is_saved}
                pendingLabel={listing.is_saved ? "Removing…" : "Saving…"}
              >
                {listing.is_saved ? "Saved" : "Save"}
              </SubmitButton>
            </form>
          ) : null}
        </div>
        {showFeedback ? (
          <div className="-ml-2 flex gap-1">
            <form action={dismissCardAction}>
              <input type="hidden" name="storeProductId" value={listing.id} />
              <SubmitButton className="btn btn-ghost btn-sm">Hide</SubmitButton>
            </form>
            <form action={notMatchCardAction}>
              <input type="hidden" name="storeProductId" value={listing.id} />
              <SubmitButton className="btn btn-ghost btn-sm">Not a match</SubmitButton>
            </form>
          </div>
        ) : null}
      </div>
    </article>
  );
}
