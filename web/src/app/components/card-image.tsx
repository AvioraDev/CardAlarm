"use client";

import { useState } from "react";

interface CardImageProps {
  /** Already sanitised by cardImageSrc. */
  src: string | null;
  srcSet?: string;
  alt: string;
  /** e.g. "#136" or "No photo". */
  fallbackPrimary: string;
  /** e.g. set name or player. */
  fallbackSecondary: string;
  fallbackNote?: string;
  loading?: "lazy" | "eager";
}

export function CardImage({
  src,
  srcSet,
  alt,
  fallbackPrimary,
  fallbackSecondary,
  fallbackNote = "No photo from store",
  loading = "lazy",
}: CardImageProps) {
  const [failed, setFailed] = useState(!src);

  // The mat: a 5:7 thumbnail on phones, a 5:4 plate with the card art centred on sm+.
  return (
    <div className="relative flex aspect-[5/7] w-full items-center justify-center overflow-hidden rounded-control bg-mat p-1.5 sm:aspect-[5/4] sm:rounded-none sm:border-b sm:border-border sm:p-3">
      {failed || !src ? (
        // "Slab label" fallback: a graded-slab-style frame with the set and the card number. No fake art.
        <div className="flex aspect-[5/7] h-full max-w-full flex-col overflow-hidden rounded-[2px] border border-border-strong bg-surface">
          <div className="hidden border-b border-border px-1.5 py-1 sm:block">
            <span className="line-clamp-2 text-[0.75rem] font-medium leading-4 text-text">{fallbackSecondary}</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-1 text-center">
            <span className="ref line-clamp-1 text-[0.9375rem] text-text-muted sm:text-[1.125rem]">{fallbackPrimary}</span>
            <span className="line-clamp-2 text-[0.75rem] leading-4 text-text-muted">{fallbackNote}</span>
          </div>
        </div>
      ) : (
        // Store image hosts are dynamic; next/image would need an open remotePatterns proxy (Decision D-a).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          srcSet={srcSet}
          sizes="(min-width: 640px) 170px, 96px"
          width={500}
          height={700}
          alt={alt}
          loading={loading}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          ref={(node) => {
            // Catches images that failed to load before hydration attached onError.
            if (node && node.complete && node.naturalWidth === 0) queueMicrotask(() => setFailed(true));
          }}
          // Multiply dissolves white store backgrounds into the mat in light mode; dark mode turns it off.
          className="aspect-[5/7] h-full w-auto max-w-full object-contain mix-blend-multiply dark:mix-blend-normal"
        />
      )}
    </div>
  );
}
