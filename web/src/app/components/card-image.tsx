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

  return (
    <div className="relative aspect-[5/7] w-full overflow-hidden rounded-2xl bg-elevated sm:rounded-none">
      {failed || !src ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center">
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-strong/60">
            <span className="data text-2xl font-semibold text-text-muted">{fallbackPrimary}</span>
            <span className="line-clamp-2 px-2 text-xs text-text-muted">{fallbackSecondary}</span>
            <span className="text-[11px] text-text-muted/70">{fallbackNote}</span>
          </div>
        </div>
      ) : (
        // Store image hosts are dynamic; next/image would need an open remotePatterns proxy (Decision D-a).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          srcSet={srcSet}
          sizes="(min-width: 640px) 18rem, 7rem"
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
          className="h-full w-full object-contain p-2 sm:p-3"
        />
      )}
    </div>
  );
}
