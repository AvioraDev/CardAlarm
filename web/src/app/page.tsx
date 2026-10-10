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

const STEPS: { step: string; title: string; body: string }[] = [
  {
    step: "01",
    title: "Pick what you're chasing",
    body: "A player, a set, a card number or a parallel. Start broad or get exact. You can change it any time.",
  },
  {
    step: "02",
    title: "We check the stores",
    body: "CardAlarm regularly checks supported hobby stores for NBA singles, so you don't have to keep ten tabs open.",
  },
  {
    step: "03",
    title: "See matches you can trust",
    body: "Every card shows the store, the price and why it matched. If we're not sure, it's marked Possible match so you can check before you buy.",
  },
];

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 py-8 md:py-14">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="eyebrow">For NBA card collectors</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-text md:text-6xl">
            Never miss the card you&apos;re chasing.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-text-muted md:text-lg">{HERO_BODY}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={user ? "/dashboard" : "/signup"} className="btn btn-primary">
              {user ? "Go to For You" : "Start watching a player"}
            </Link>
            <Link href={user ? "/watchlists" : "/login"} className="btn btn-secondary">
              {user ? "Your watchlists" : "Sign in"}
            </Link>
          </div>
          {!user ? <p className="mt-3 text-sm text-text-muted">Free while in beta. NBA singles only for now.</p> : null}
        </div>
        <figure aria-labelledby="example-caption" className="mx-auto w-full max-w-md">
          <div className="grid gap-3 sm:grid-cols-2">
            <ListingCard listing={EXAMPLE_CONFIRMED} preview />
            <ListingCard listing={EXAMPLE_POSSIBLE} preview />
          </div>
          <figcaption id="example-caption" className="mt-3 text-center text-xs text-text-muted">
            Illustrative example. Not a live listing, store or price.
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-xl font-semibold tracking-tight text-text">
          How it works
        </h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ step, title, body }) => (
            <li key={step} className="panel p-5">
              <span className="data text-sm text-accent">{step}</span>
              <h3 className="mt-2 text-base font-semibold text-text">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
