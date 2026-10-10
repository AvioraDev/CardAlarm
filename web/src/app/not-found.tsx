import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-text">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">
        It may have been removed, or the link might be wrong.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
      >
        Back to For You
      </Link>
    </section>
  );
}
