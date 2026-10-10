import Link from "next/link";
import { ListingCard } from "@/app/components/listing-card";
import { getCurrentUser } from "@/lib/auth";
import type { ListingRow } from "@/lib/types";

const HERO_BODY =
  "Tell CardAlarm the players and cards you're after. We keep an eye on online hobby stores and show you matching NBA singles that are in stock, with a clear note on how sure we are that each one is the right card.";

// Illustrative examples only: not a live listing, store or price.
const EXAMPLE_CONFIRMED: ListingRow = {
  id: -1,
  external_id: "example-1",
  source: "example",
  store_name: "Example Hobby Store",
  currency: "NZD",
  title: "2023-24 Panini Prizm Victor Wembanyama #136 Silver Prizm RC",
  price: 249,
  url: "#",
  image_url: "",
  match_type: "Matched",
  is_dismissed: false,
  is_saved: false,
  is_dismissed_for_user: false,
  is_not_match_for_user: false,
  is_oos: false,
  created_at: "2026-01-01T00:00:00.000Z",
  last_checked_at: null,
  year: "2023-24",
  set_name: "Panini Prizm",
  card_number: "136",
  player_name: "Victor Wembanyama",
  variant: "Silver Prizm",
  is_serial: false,
  serial_number: null,
  serial_current: null,
  serial_limit: null,
  is_auto: false,
  is_rookie: true,
  category: "NBA",
  match_confidence: 0.94,
  match_status: "confirmed",
  match_reasons: [
    "Watchlist player name found in title",
    "Checklist matched by set context and card number",
    "Rookie indicator detected",
  ],
  unmatched_fields: [],
  matcher_version: "example",
};

const EXAMPLE_POSSIBLE: ListingRow = {
  ...EXAMPLE_CONFIRMED,
  id: -2,
  external_id: "example-2",
  title: "Wembanyama Select Blue /199 rookie",
  price: 120,
  set_name: "Panini Select",
  card_number: null,
  variant: "Blue",
  is_serial: true,
  serial_limit: "199",
  match_confidence: 0.68,
  match_status: "possible",
  match_reasons: ["Watchlist player name found in title", "No card number extracted", "Serialized card detected"],
};

const STEPS: { title: string; body: string }[] = [
  {
    title: "Pick what you're chasing",
    body: "A player, a set, a card number or a parallel. Start broad or get exact. You can change it any time.",
  },
  {
    title: "We check the stores",
    body: "CardAlarm regularly checks supported hobby stores for NBA singles, so you don't have to keep ten tabs open.",
  },
  {
    title: "See matches you can trust",
    body: "Every card shows the store, the price and why it matched. If we're not sure, it's marked Possible match so you can check before you buy.",
  },
];

const MATCH_FACTS: { term: string; detail: string }[] = [
  {
    term: "Store, price and last check",
    detail: "Which store has the card, the price in the store's currency, and when we last saw it in stock.",
  },
  {
    term: "Confirmed match",
    detail: "The listing names the player and the card details line up with the checklist.",
  },
  {
    term: "Possible match",
    detail:
      "Something is missing or unclear, often the card number. These are kept in their own section with a dashed outline so you can check before you buy.",
  },
  {
    term: "Why it matched",
    detail: "Up to two plain-English reasons on every card, so you never have to take our word for it.",
  },
  {
    term: "Hide and Not a match",
    detail: "Hide a card you're not interested in, or tell us it's the wrong card and we'll stop showing it to you.",
  },
];

const SECTION = "grid gap-8 border-t border-border py-12 md:grid-cols-[16rem_1fr] md:py-20";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-[1120px]">
      {/* The layout's <main> already pads the top, so the hero adds the rest of the spec's pt-8 / md:pt-16. */}
      <section
        aria-labelledby="hero-heading"
        className="grid gap-10 pb-12 pt-3 md:pb-20 md:pt-8 lg:grid-cols-[1.1fr_1fr] lg:items-start"
      >
        <div>
          <p className="eyebrow">For NBA card collectors</p>
          <h1 id="hero-heading" className="display-title mt-3 text-text">
            Never miss the card you&apos;re chasing.
          </h1>
          <p className="mt-5 max-w-[34rem] text-[1.0625rem] leading-[1.625rem] text-text-muted md:text-[1.125rem] md:leading-[1.75rem]">
            {HERO_BODY}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={user ? "/dashboard" : "/signup"} className="btn btn-primary">
              {user ? "Go to For You" : "Start watching a player"}
            </Link>
            <Link href={user ? "/watchlists" : "/login"} className="btn btn-secondary">
              {user ? "Your watchlists" : "Sign in"}
            </Link>
          </div>
          {!user ? (
            <p className="mt-4 text-[0.8125rem] leading-[1.125rem] text-text-muted">
              Free while in beta. NBA singles only for now.
            </p>
          ) : null}
        </div>
        <figure aria-labelledby="example-caption">
          <div className="grid gap-3 sm:grid-cols-2">
            <ListingCard listing={EXAMPLE_CONFIRMED} preview />
            <ListingCard listing={EXAMPLE_POSSIBLE} preview />
          </div>
          <figcaption id="example-caption" className="mt-3 text-[0.75rem] leading-4 text-text-muted">
            Illustrative example. Not a live listing, store or price.
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="how-heading" className={SECTION}>
        <h2 id="how-heading" className="page-title text-text">
          How it works
        </h2>
        <ol className="divide-y divide-border border-y border-border">
          {STEPS.map(({ title, body }, index) => (
            <li key={title} className="grid gap-2 py-5 sm:grid-cols-[12rem_1fr] sm:gap-6">
              <h3 className="section-title text-text">
                <span className="data mr-2 text-text-muted">{index + 1}</span>
                {title}
              </h3>
              <p className="text-text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="match-heading" className={SECTION}>
        <h2 id="match-heading" className="page-title text-text">
          What every match shows you
        </h2>
        <dl className="divide-y divide-border border-y border-border">
          {MATCH_FACTS.map(({ term, detail }) => (
            <div key={term} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
              <dt className="font-medium text-text">{term}</dt>
              <dd className="text-text-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="scope-heading" className="border-t border-border py-12 md:py-20">
        <div className="max-w-2xl">
          <h2 id="scope-heading" className="page-title text-text">
            What CardAlarm covers today
          </h2>
          <p className="mt-4 text-text-muted">
            NBA singles from supported online hobby stores, checked regularly. CardAlarm doesn&apos;t sell cards. When
            you find one you want, you buy it from the store, at the store&apos;s price.
          </p>
        </div>
      </section>

      {!user ? (
        <section
          aria-labelledby="closing-heading"
          className="flex flex-col gap-5 border-t border-border py-12 sm:flex-row sm:items-end sm:justify-between md:py-20"
        >
          <h2 id="closing-heading" className="page-title text-text">
            Who are you chasing?
          </h2>
          <Link href="/signup" className="btn btn-primary self-start sm:self-auto">
            Start watching a player
          </Link>
        </section>
      ) : null}
    </div>
  );
}
