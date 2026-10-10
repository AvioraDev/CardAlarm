const PULSE = "animate-pulse motion-reduce:animate-none";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <div className={`h-8 w-40 rounded-full bg-card ${PULSE}`} />
      <div className={`h-4 w-64 max-w-full rounded-full bg-card ${PULSE}`} />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`h-10 w-28 shrink-0 rounded-full bg-card ${PULSE}`} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[7rem_1fr] gap-3 rounded-3xl border border-border bg-card p-3 sm:grid-cols-1 sm:p-0"
          >
            <div className={`aspect-[5/7] rounded-2xl bg-elevated sm:rounded-b-none sm:rounded-t-3xl ${PULSE}`} />
            <div className="space-y-2 sm:p-4">
              <div className={`h-4 w-3/4 rounded-full bg-elevated ${PULSE}`} />
              <div className={`h-3 w-1/2 rounded-full bg-elevated ${PULSE}`} />
              <div className={`h-6 w-20 rounded-full bg-elevated ${PULSE}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
