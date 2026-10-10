import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { SubmitButton } from "@/app/components/submit-button";
import Link from "next/link";
import { friendlyError } from "@/lib/friendly-error";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { CatalogueOption, WatchlistCatalogueOptionFilters } from "@/lib/catalogue-options";
import { getWatchlistCatalogueOptions } from "@/lib/catalogue-options";
import { getUserWatchlist } from "@/lib/watchlists";
import {
  backfillUserWatchlistAction,
  deleteUserWatchlistAction,
  toggleUserWatchlistAction,
  toggleWatchlistNotificationsAction,
  updateWatchlistAction,
} from "@/lib/watchlist-actions";
import { CatalogueRefineForm, WatchlistFormFields } from "../watchlist-form-fields";

interface WatchlistDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function priceRange(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `${formatPrice(min)} – ${formatPrice(max)}`;
  if (min !== null) return `${formatPrice(min)} and up`;
  if (max !== null) return `Up to ${formatPrice(max)}`;
  return null;
}

function labelFor(options: CatalogueOption[], id: number | null | undefined): string | null {
  if (!id) return null;
  return options.find((option) => option.id === id)?.label || null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function positiveQueryId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

function queryText(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed || null;
}

export default async function WatchlistDetailPage({ params, searchParams }: WatchlistDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : undefined;
  const watchlistId = Number(id);
  if (!Number.isInteger(watchlistId)) notFound();

  const watchlist = await getUserWatchlist(user.id, watchlistId);
  if (!watchlist) notFound();
  const rule = watchlist.rules[0];
  const selected: WatchlistCatalogueOptionFilters = {
    playerId: positiveQueryId(query.playerId) ?? rule?.player_id ?? null,
    setId: positiveQueryId(query.setId) ?? rule?.set_id ?? null,
    cardId: rule?.catalogue_card_id ?? null,
    season: queryText(query.season) ?? rule?.season ?? null,
    productLine: queryText(query.productLine) ?? rule?.product_line ?? null,
  };
  const catalogueOptions = await getWatchlistCatalogueOptions(selected);
  const ruleSelected: WatchlistCatalogueOptionFilters = {
    playerId: rule?.player_id ?? null,
    setId: rule?.set_id ?? null,
    cardId: rule?.catalogue_card_id ?? null,
    season: rule?.season ?? null,
    productLine: rule?.product_line ?? null,
  };
  const sameSelection =
    selected.playerId === ruleSelected.playerId &&
    selected.setId === ruleSelected.setId &&
    selected.season === ruleSelected.season &&
    selected.productLine === ruleSelected.productLine;
  const ruleOptions = sameSelection ? catalogueOptions : await getWatchlistCatalogueOptions(ruleSelected);

  // Resolve catalogue IDs to names. A row whose ID cannot be resolved is dropped,
  // so a raw database ID is never shown as a label.
  const lookingFor: Array<[string, string | null]> = rule
    ? [
        ["Player", labelFor(ruleOptions.players, rule.player_id)],
        ["Team", labelFor(ruleOptions.teams, rule.team_id)],
        ["Set", labelFor(ruleOptions.sets, rule.set_id)],
        ["Specific card", labelFor(ruleOptions.cards, rule.catalogue_card_id)],
        ["Parallel / variant", labelFor(ruleOptions.variants, rule.catalogue_variant_id)],
        ["Must include words", clean(rule.include_terms)],
        ["Leave out words", clean(rule.exclude_terms)],
        ["Brand", clean(rule.brand)],
        ["Product line", clean(rule.product_line)],
        ["Season", clean(rule.season)],
        ["Card number", clean(rule.card_number)],
        ["Parallel", clean(rule.parallel)],
        ["Price", priceRange(rule.min_price, rule.max_price)],
        [
          "Only show",
          [
            rule.rookie_only ? "Rookies" : null,
            rule.autograph_only ? "Autographs" : null,
            rule.relic_only ? "Relics" : null,
            rule.serial_numbered_only ? "Numbered" : null,
            rule.graded_only ? "Graded" : null,
            rule.raw_only ? "Raw" : null,
          ]
            .filter(Boolean)
            .join(", ") || null,
        ],
        ["Minimum confidence", `${Math.round(rule.minimum_match_confidence * 100)}%`],
      ]
    : [];
  const lookingForRows = lookingFor.filter((row): row is [string, string] => row[1] !== null);
  const isBroad =
    !(rule && (rule.player_id || rule.team_id || rule.set_id || rule.catalogue_card_id || rule.catalogue_variant_id)) &&
    lookingForRows.filter(([label]) => label !== "Minimum confidence").length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 md:space-y-6">
      <header>
        <Link href="/watchlists" className="link text-[0.8125rem]">
          Watchlists
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="page-title text-text">{watchlist.name}</h1>
          <span className="tag">{watchlist.is_active ? "Active" : "Paused"}</span>
        </div>
        <p className="mt-1 text-[0.8125rem] leading-[1.125rem] text-text-muted">
          Created {new Date(watchlist.created_at).toLocaleDateString()} · <span className="data">{watchlist.match_count}</span> found cards · Alerts {watchlist.notification_enabled ? "on" : "off"}
        </p>
        {error ? (
          <div role="alert" className="notice notice-error mt-4">
            {friendlyError(error)}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={backfillUserWatchlistAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <SubmitButton className="btn btn-secondary btn-sm">
              Refresh matches
            </SubmitButton>
          </form>
          <form action={toggleUserWatchlistAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <input type="hidden" name="isActive" value={String(watchlist.is_active)} />
            <SubmitButton className="btn btn-ghost btn-sm">
              {watchlist.is_active ? "Pause" : "Activate"}
            </SubmitButton>
          </form>
          <form action={toggleWatchlistNotificationsAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <input type="hidden" name="notificationsEnabled" value={String(watchlist.notification_enabled)} />
            <SubmitButton className="btn btn-ghost btn-sm">
              {watchlist.notification_enabled ? "Turn alerts off" : "Turn alerts on"}
            </SubmitButton>
          </form>
          <form action={deleteUserWatchlistAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <ConfirmSubmitButton message="Delete this watchlist and its matches? This can't be undone." className="btn btn-danger btn-sm">
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </header>

      <section className="panel p-5 md:p-6">
        <h2 className="section-head text-text">
          <span className="data">{watchlist.match_count}</span> cards currently match this watchlist
        </h2>
        <p className="mt-1 max-w-2xl text-[0.875rem] text-text-muted">
          CardAlarm checks this watchlist against the latest store inventory whenever you create or change it. Matching cards appear in For You.
        </p>
        <Link href={`/dashboard?watchlistId=${watchlist.id}`} className="btn btn-secondary btn-sm mt-4">
          See these cards
        </Link>
      </section>

      {rule ? (
        <section className="panel p-5 md:p-6">
          <h2 className="section-head text-text">What this watchlist looks for</h2>
          {isBroad ? (
            <p className="mt-3 text-text">Every NBA card we find for any player</p>
          ) : null}
          <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {lookingForRows.map(([label, value]) => (
              <div key={label}>
                <dt className="field-label text-text-muted">{label}</dt>
                <dd className="text-[0.9375rem] text-text">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {rule ? (
        <section className="panel p-5 md:p-6">
          <p className="eyebrow">Edit Watchlist</p>
          <h2 className="section-head mt-1 text-text">Filter details</h2>
          <div className="mt-4">
            <CatalogueRefineForm action={`/watchlists/${watchlist.id}`} options={catalogueOptions} selected={selected} />
          </div>
          <form action={updateWatchlistAction} className="mt-5">
            <WatchlistFormFields
              options={catalogueOptions}
              selected={selected}
              watchlist={watchlist}
              rule={rule}
              submitLabel="Save watchlist"
            />
          </form>
        </section>
      ) : null}
    </div>
  );
}
