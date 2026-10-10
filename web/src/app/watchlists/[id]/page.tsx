import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { SubmitButton } from "@/app/components/submit-button";
import Link from "next/link";
import { friendlyError } from "@/lib/friendly-error";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { WatchlistCatalogueOptionFilters } from "@/lib/catalogue-options";
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

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function formatPrice(value: number | null): string {
  if (value === null) return "Any";
  return `$${value.toFixed(2)}`;
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="panel p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link href="/watchlists" className="nav-link hover:text-accent">
              ← Watchlists
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text md:text-4xl">
              {watchlist.name}
            </h1>
            <p className="mt-2 text-xs text-text-muted">
              Created {new Date(watchlist.created_at).toLocaleDateString()} · <span className="data">{watchlist.match_count}</span> found cards · Alerts {watchlist.notification_enabled ? "on" : "off"}
            </p>
          </div>
          <span className={watchlist.is_active ? "tag tag-accent" : "tag"}>
            {watchlist.is_active ? "Active" : "Paused"}
          </span>
        </div>
        {error ? (
          <div role="alert" className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text">
            {friendlyError(error)}
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <form action={toggleUserWatchlistAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <input type="hidden" name="isActive" value={String(watchlist.is_active)} />
            <SubmitButton className="btn btn-secondary btn-sm">
              {watchlist.is_active ? "Pause" : "Activate"}
            </SubmitButton>
          </form>
          <form action={deleteUserWatchlistAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <ConfirmSubmitButton message="Delete this watchlist and its matches? This can't be undone." className="btn btn-danger btn-sm">
              Delete
            </ConfirmSubmitButton>
          </form>
          <form action={toggleWatchlistNotificationsAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <input type="hidden" name="notificationsEnabled" value={String(watchlist.notification_enabled)} />
            <SubmitButton className="btn btn-secondary btn-sm">
              {watchlist.notification_enabled ? "Turn Alerts Off" : "Turn Alerts On"}
            </SubmitButton>
          </form>
          <form action={backfillUserWatchlistAction}>
            <input type="hidden" name="watchlistId" value={watchlist.id} />
            <SubmitButton className="btn btn-primary btn-sm">
              Refresh matches
            </SubmitButton>
          </form>
        </div>
      </section>

      {rule ? (
        <section className="panel p-6 md:p-8">
        <p className="eyebrow">Watchlist filter</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              ["Include terms", rule.include_terms ?? "Any"],
              ["Exclude terms", rule.exclude_terms ?? "None"],
              ["Intent", rule.intent_type],
              ["Player ID", rule.player_id ?? "Any"],
              ["Team ID", rule.team_id ?? "Any"],
              ["Set ID", rule.set_id ?? "Any"],
              ["Specific card ID", rule.catalogue_card_id ?? "Any"],
              ["Parallel / variant ID", rule.catalogue_variant_id ?? "Any"],
              ["Brand", rule.brand ?? "Any"],
              ["Product line", rule.product_line ?? "Any"],
              ["Season", rule.season ?? "Any"],
              ["Card number", rule.card_number ?? "Any"],
              ["Parallel", rule.parallel ?? "Any"],
              ["Price", `${formatPrice(rule.min_price)} – ${formatPrice(rule.max_price)}`],
              ["Minimum confidence", `${Math.round(rule.minimum_match_confidence * 100)}%`],
              ["Rookie only", yesNo(rule.rookie_only)],
              ["Autograph only", yesNo(rule.autograph_only)],
              ["Relic only", yesNo(rule.relic_only)],
              ["Numbered", yesNo(rule.serial_numbered_only)],
              ["Graded only", yesNo(rule.graded_only)],
              ["Raw only", yesNo(rule.raw_only)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-border bg-bg/45 p-4">
                <p className="field-label">{label}</p>
                <p className="mt-1 text-sm text-text">{value}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {rule ? (
        <section className="panel p-6 md:p-8">
          <p className="eyebrow">Edit Watchlist</p>
          <h2 className="mt-3 text-xl font-semibold text-text">Filter details</h2>
          <div className="mt-5">
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

      <section className="panel p-6 md:p-8">
        <p className="eyebrow">Found cards</p>
        <h2 className="mt-2 text-xl font-semibold text-text">
          <span className="data">{watchlist.match_count}</span> cards currently match this watchlist
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
          CardAlarm checks this watchlist against the latest store inventory whenever you create or change it. Matching cards appear in For You.
        </p>
        <Link href={`/dashboard?watchlistId=${watchlist.id}`} className="btn btn-secondary btn-sm mt-4">
          See these cards
        </Link>
      </section>
    </div>
  );
}
