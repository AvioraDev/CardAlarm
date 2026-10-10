import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
      <p className="eyebrow">Page not found</p>
      <h1 className="mt-3 text-2xl font-semibold text-text">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">
        It may have been removed, or the link might be wrong.
      </p>
      <Link
        href="/dashboard"
        className="btn btn-primary mt-6"
      >
        Back to For You
      </Link>
    </section>
  );
}
