import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel mx-auto max-w-lg px-6 py-10 text-left md:px-10">
      <h1 className="section-title text-text">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-text-muted">It may have been removed, or the link might be wrong.</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href="/dashboard" className="btn btn-primary">
          Back to For You
        </Link>
        <Link href="/" className="btn btn-secondary">
          Go home
        </Link>
      </div>
    </section>
  );
}
