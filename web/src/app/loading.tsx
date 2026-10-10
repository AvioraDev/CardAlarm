const PULSE = "animate-pulse motion-reduce:animate-none";
const BLOCK = `rounded-[2px] bg-mat ${PULSE}`;

// Shared card grid (dashboard, saved, loading): max 4 columns.
const CARD_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 xl:gap-5";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-5 md:space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <div className={`h-8 w-40 ${BLOCK}`} />
        <div className={`h-4 w-64 max-w-full ${BLOCK}`} />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`h-10 w-28 shrink-0 rounded-control bg-mat ${PULSE}`} />
        ))}
      </div>
      <div className="h-12 w-full rounded-card border border-border bg-surface" />
      <div className={CARD_GRID}>
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[6rem_1fr] gap-3 overflow-hidden rounded-card border border-border bg-surface p-3 sm:flex sm:flex-col sm:p-0"
          >
            <div className={`aspect-[5/7] rounded-control bg-mat sm:aspect-[5/4] sm:rounded-none ${PULSE}`} />
            <div className="space-y-2 sm:p-4">
              <div className={`h-3 w-2/5 ${BLOCK}`} />
              <div className={`h-4 w-3/4 ${BLOCK}`} />
              <div className={`h-3 w-1/2 ${BLOCK}`} />
              <div className={`h-4 w-[30%] ${BLOCK}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
