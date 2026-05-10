"use client";

import { useMemo, useTransition } from "react";
import { dismissListing } from "@/lib/actions";
import type { ListingRow } from "@/lib/types";

interface ListingCardProps {
  listing: ListingRow;
  allowDismiss?: boolean;
}

function parseReasons(value: string[] | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function confidenceLabel(confidence: number | null): string {
  if (confidence === null) return "Unscored";
  if (confidence >= 0.9) return "High confidence";
  if (confidence >= 0.75) return "Strong match";
  if (confidence >= 0.6) return "Possible match";
  return "Low confidence";
}

function formatPrice(value: number | string | null): string {
  const price = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(price)) return "Price unavailable";
  return `$${price.toFixed(2)}`;
}

export function ListingCard({ listing, allowDismiss = true }: ListingCardProps) {
  const [isPending, startTransition] = useTransition();
  const reasons = useMemo(() => parseReasons(listing.match_reasons).slice(0, 3), [listing.match_reasons]);

  function handleDismiss() {
    startTransition(() => {
      dismissListing(listing.id);
    });
  }

  if (isPending) {
    return <div className="h-[460px] rounded-3xl border border-border bg-card opacity-30" />;
  }

  const confidence = listing.match_confidence;
  const isPossible = listing.match_status === "possible";
  const matchAccent = isPossible ? "text-stealth border-stealth/30 bg-stealth/10" : "text-direct border-direct/30 bg-direct/10";
  const serialDisplay = listing.serial_current && listing.serial_limit
    ? `${listing.serial_current}/${listing.serial_limit}`
    : listing.serial_limit
      ? `/${listing.serial_limit}`
      : listing.serial_number;
  const primaryTitle = listing.player_name ?? listing.title;
  const secondaryTitle = listing.player_name ? listing.title : listing.set_name ?? listing.source;
  const matchTypeLabel = listing.match_type === "Cached" ? "Found" : listing.match_type;

  return (
    <article className="group overflow-hidden rounded-3xl border border-border bg-card shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover">
      <div className="relative aspect-[4/3] overflow-hidden bg-elevated">
        {listing.image_url ? (
          // External Shopify image hosts are dynamic; plain img avoids brittle remotePatterns for this local MVP.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.image_url}
            alt={listing.title}
            className="h-full w-full object-contain p-3 transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-4xl text-text-muted">
            #
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${matchAccent}`}>
            {listing.match_status ?? "confirmed"}
          </span>
          <span className="rounded-full border border-border bg-bg/85 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted backdrop-blur">
            {matchTypeLabel}
          </span>
        </div>

        {listing.category && listing.category !== "NBA" && (
          <span className="absolute right-3 top-3 rounded-full border border-border bg-bg/85 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {listing.category}
          </span>
        )}
      </div>

      <div className="flex min-h-[230px] flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="line-clamp-1 text-base font-semibold tracking-tight text-text">
              {primaryTitle}
            </h2>
            <span className="shrink-0 font-mono text-lg font-bold text-text">
              {formatPrice(listing.price)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-text-muted" title={listing.title}>
            {secondaryTitle}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {listing.year && <span className="tag">{listing.year}</span>}
          {listing.set_name && <span className="tag max-w-[170px] truncate">{listing.set_name}</span>}
          {listing.card_number && <span className="tag">#{listing.card_number}</span>}
          {listing.variant && <span className="tag max-w-[150px] truncate">{listing.variant}</span>}
          {listing.is_serial && serialDisplay && <span className="tag tag-accent">{serialDisplay}</span>}
          {listing.is_auto && <span className="tag tag-warning">Auto</span>}
          {listing.is_rookie && <span className="tag tag-rookie">RC</span>}
        </div>

        <div className="rounded-2xl border border-border bg-bg/45 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-text">{confidenceLabel(confidence)}</span>
            <span className="font-mono text-xs text-text-muted">
              {confidence === null ? "—" : `${Math.round(confidence * 100)}%`}
            </span>
          </div>
          {reasons.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs leading-4 text-text-muted">
              {reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            {listing.source}
          </span>
          <div className="flex gap-2">
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-accent px-4 py-2 text-xs font-bold uppercase tracking-wider text-bg transition hover:bg-accent-hover"
            >
              Open store
            </a>
            {allowDismiss ? (
              <button
                onClick={handleDismiss}
                className="rounded-full border border-danger/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-danger transition hover:bg-danger hover:text-bg"
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
