import { CardImage } from "@/app/components/card-image";
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
        <span aria-hidden="true">?</span> {tierLabel(tier)}
      </span>
    );
  }
  if (tier === "unmatched") {
    return <span className="badge badge-neutral">{tierLabel(tier)}</span>;
  }
  return (
    <span className="badge badge-confirmed">
      <span aria-hidden="true">✓</span> {tierLabel(tier)}
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
  const detailLine = [
    listing.year,
    listing.set_name,
    listing.card_number ? `#${listing.card_number}` : null,
    listing.variant,
  ]
    .filter(Boolean)
    .join(" · ");
  const storeName = listing.store_name || listing.source;
  const showFeedback = showFeedbackControls && !preview;

  return (
    <article
      data-match-tier={tier}
      className={`grid grid-cols-[7rem_1fr] gap-x-3 gap-y-3 overflow-hidden rounded-3xl border bg-card p-3 shadow-card transition-colors sm:grid-cols-1 sm:gap-0 sm:p-0 ${
        isPossible ? "card-possible" : "border-border hover:border-border-strong"
      }`}
    >
      <div className="relative sm:border-b sm:border-border">
        <CardImage
          src={src}
          srcSet={srcSet}
          alt={alt}
          fallbackPrimary={listing.card_number ? `#${listing.card_number}` : "No photo"}
          fallbackSecondary={listing.set_name ?? primaryTitle}
          fallbackNote={preview ? "Example card" : undefined}
          loading={imageLoading ?? "lazy"}
        />
        {preview ? <span className="badge badge-example absolute right-2 top-2">Example</span> : null}
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:p-4 sm:pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <MatchBadge tier={tier} />
          {pct ? (
            <span className="data text-xs text-text-muted" aria-label={`${pct} match confidence`}>
              {pct}
            </span>
          ) : null}
        </div>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-text">{primaryTitle}</h3>
        {detailLine ? <p className="line-clamp-2 text-sm leading-5 text-text-muted">{detailLine}</p> : null}
        <p className="line-clamp-1 text-xs text-text-muted/80" title={listing.title}>
          Listed as: {listing.title}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {listing.is_serial && serialDisplay ? <span className="tag tag-accent">{serialDisplay}</span> : null}
          {listing.is_serial && !serialDisplay ? <span className="tag tag-accent">Numbered</span> : null}
          {listing.is_auto ? <span className="tag tag-warning">Auto</span> : null}
          {listing.is_rookie ? <span className="tag tag-rookie">RC</span> : null}
          {listing.category && listing.category !== "NBA" ? <span className="tag">{listing.category}</span> : null}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="data text-xl font-semibold text-text">{formatPrice(listing.price, listing.currency)}</span>
          <span className="truncate text-xs text-text-muted">{storeName}</span>
        </div>
        {reasons.length > 0 ? (
          <p className="text-xs leading-5 text-text-muted">
            <span className="font-medium text-text">Why it matched:</span> {reasons.join(" · ")}
          </p>
        ) : null}
        {isPossible ? (
          <p className="text-xs leading-5 text-possible">
            We&apos;re less sure about this one. Check the details before you buy.
          </p>
        ) : null}
        {!preview && checked ? <p className="text-[11px] text-text-muted/80">{checked}</p> : null}
      </div>

      <div className="col-span-2 flex flex-col gap-2 sm:col-span-1 sm:p-4 sm:pt-3">
        <div className="flex gap-2">
          {preview ? (
            <span aria-disabled="true" className="btn btn-primary btn-sm flex-1">
              Open store
            </span>
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm flex-1"
              aria-label={`Open store listing at ${storeName} (opens in a new tab)`}
            >
              Open store
            </a>
          )}
          {showFeedback ? (
            <form action={listing.is_saved ? unsaveCardAction : saveCardAction}>
              <input type="hidden" name="storeProductId" value={listing.id} />
              <SubmitButton
                className={`btn btn-sm ${listing.is_saved ? "btn-primary" : "btn-secondary"}`}
                pendingLabel={listing.is_saved ? "Removing…" : "Saving…"}
              >
                {listing.is_saved ? "Saved" : "Save"}
              </SubmitButton>
            </form>
          ) : null}
        </div>
        {showFeedback ? (
          <div className="flex gap-1">
            <form action={dismissCardAction}>
              <input type="hidden" name="storeProductId" value={listing.id} />
              <SubmitButton className="btn btn-ghost btn-sm text-xs">Hide</SubmitButton>
            </form>
            <form action={notMatchCardAction}>
              <input type="hidden" name="storeProductId" value={listing.id} />
              <SubmitButton className="btn btn-ghost btn-sm text-xs">Not a match</SubmitButton>
            </form>
          </div>
        ) : null}
      </div>
    </article>
  );
}
