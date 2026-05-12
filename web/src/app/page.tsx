import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 py-10 md:py-16">
      <section className="rounded-[2rem] border border-border bg-card p-6 shadow-card md:p-10">
        <p className="font-mono text-xs uppercase tracking-[0.26em] text-accent">
          CardAlarm Watchlists
        </p>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-text md:text-6xl">
              Never miss the card you&apos;re chasing.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-text-muted md:text-lg">
              Tell CardAlarm what cards you are chasing. It watches hobby stores
              and surfaces cards found for your watchlists with confidence and clear reasons.
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-bg/60 p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
              How it works
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-text-muted">
              <li>Cards found for your watchlists</li>
              <li>Confidence-based matching</li>
              <li>User-owned watchlists</li>
              <li>Focused discovery workflow</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={user ? "/dashboard" : "/signup"}
            className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
          >
            {user ? "Open For You" : "Create Watchlist"}
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
          ["Watch", "CardAlarm keeps checking supported stores for cards on your watchlists."],
          ["Match", "Found cards are confidence-scored with reasons and uncertainty labels."],
          ["Refine", "Update watchlists over time as your collecting goals change."],
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
