import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 py-10 md:py-16">
      <section className="rounded-[2rem] border border-border bg-card p-6 shadow-card md:p-10">
        <p className="font-mono text-xs uppercase tracking-[0.26em] text-accent">
          CardAlarm MVP
        </p>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-text md:text-6xl">
              Never miss the card you&apos;re chasing.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-text-muted md:text-lg">
              CardAlarm scans hobby-store inventory, caches every listing, and
              surfaces the cards that match your watchlists with confidence and
              clear reasons.
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-bg/60 p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
              Current build focus
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-text-muted">
              <li>Cached Shopify inventory</li>
              <li>Confidence-based matching</li>
              <li>User-owned watchlists</li>
              <li>Fast dashboard workflow</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={user ? "/dashboard" : "/signup"}
            className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
          >
            {user ? "Open Dashboard" : "Create Watchlist"}
          </Link>
          <Link
            href={user ? "/watchlists" : "/login"}
            className="inline-flex items-center justify-center rounded-full border border-border px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent"
          >
            {user ? "Manage Watchlists" : "Sign In"}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Scan", "Store inventory is cached first, so dashboards never depend on live scraping."],
          ["Match", "Catalogue matches are confidence-scored with reasons and uncertainty labels."],
          ["Backfill", "New watchlists can be evaluated against existing cached products immediately."],
        ].map(([title, body]) => (
          <article key={title} className="rounded-3xl border border-border bg-card p-5 shadow-card">
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-text">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-muted">{body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
