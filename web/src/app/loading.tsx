export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="h-32 animate-pulse rounded-3xl border border-border bg-card motion-reduce:animate-none" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-80 animate-pulse rounded-3xl border border-border bg-card motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
