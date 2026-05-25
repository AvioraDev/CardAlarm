import type { WatchlistCatalogueOptionFilters, WatchlistCatalogueOptions } from "@/lib/catalogue-options";
import type { UserWatchlistRow, UserWatchlistRuleRow } from "@/lib/types";

type WatchlistFormFieldsProps = {
  options: WatchlistCatalogueOptions;
  selected: WatchlistCatalogueOptionFilters;
  watchlist?: UserWatchlistRow;
  rule?: UserWatchlistRuleRow;
  submitLabel: string;
};

type CatalogueRefineFormProps = {
  action: string;
  options: WatchlistCatalogueOptions;
  selected: WatchlistCatalogueOptionFilters;
};

function textValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function selectedId(value: number | null | undefined): string {
  return value ? String(value) : "";
}

function optionLabel(label: string, fallback: string): string {
  return label || fallback;
}

function Datalist({ id, values }: { id: string; values: string[] }) {
  return (
    <datalist id={id}>
      {values.map((value) => (
        <option key={value} value={value} />
      ))}
    </datalist>
  );
}

export function CatalogueRefineForm({ action, options, selected }: CatalogueRefineFormProps) {
  return (
    <form method="get" action={action} className="rounded-3xl border border-border bg-card p-5 shadow-card">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Catalogue player</span>
          <select name="playerId" defaultValue={selectedId(selected.playerId)} className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent">
            <option value="">Select a player</option>
            {options.players.map((player) => (
              <option key={player.id} value={player.id}>{player.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Catalogue set</span>
          <select name="setId" defaultValue={selectedId(selected.setId)} className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent">
            <option value="">Select a set</option>
            {options.sets.map((set) => (
              <option key={set.id} value={set.id}>{optionLabel(set.label, `Set ${set.id}`)}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-full border border-border px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent">
          Refine Cards
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-text-muted">
        Choose a player first, then narrow by set. Card choices are loaded only after a player or set is selected.
      </p>
    </form>
  );
}

export function WatchlistFormFields({ options, selected, watchlist, rule, submitLabel }: WatchlistFormFieldsProps) {
  const listPrefix = watchlist ? `watchlist-${watchlist.id}` : "new-watchlist";
  const selectedPlayerId = selected.playerId ?? rule?.player_id ?? null;
  const selectedSetId = selected.setId ?? rule?.set_id ?? null;
  const selectedCardId = selected.cardId ?? rule?.catalogue_card_id ?? null;
  const canSelectCard = Boolean(selectedPlayerId || selectedSetId || selectedCardId);

  return (
    <>
      {watchlist ? <input type="hidden" name="watchlistId" value={watchlist.id} /> : null}
      {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Watchlist name *</span>
          <input
            name="name"
            required
            defaultValue={watchlist?.name ?? ""}
            placeholder="Victor Wembanyama Prizm rookies"
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </label>

        <div className="rounded-2xl border border-border bg-bg/45 p-4 md:col-span-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-accent">Catalogue fields</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Catalogue fields are preferred. Include terms are fallback only.
          </p>
        </div>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Catalogue player</span>
          <select name="player_id" defaultValue={selectedId(selectedPlayerId)} className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent">
            <option value="">Any player</option>
            {options.players.map((player) => (
              <option key={player.id} value={player.id}>{player.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Catalogue team</span>
          <select name="team_id" defaultValue={selectedId(rule?.team_id)} className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent">
            <option value="">Any team</option>
            {options.teams.map((team) => (
              <option key={team.id} value={team.id}>{team.label}</option>
            ))}
          </select>
        </label>

        <label className="block md:col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Catalogue set</span>
          <select name="set_id" defaultValue={selectedId(selectedSetId)} className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent">
            <option value="">Any set</option>
            {options.sets.map((set) => (
              <option key={set.id} value={set.id}>{optionLabel(set.label, `Set ${set.id}`)}</option>
            ))}
          </select>
        </label>

        {canSelectCard ? (
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Catalogue card</span>
            <select name="catalogue_card_id" defaultValue={selectedId(selectedCardId)} className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent">
              <option value="">Any card</option>
              {options.cards.map((card) => (
                <option key={card.id} value={card.id}>{optionLabel(card.label, `Card ${card.id}`)}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="rounded-2xl border border-border bg-bg/45 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Catalogue card</p>
            <p className="mt-1 text-sm leading-6 text-text-muted">Select a player or set first.</p>
            <input type="hidden" name="catalogue_card_id" value="" />
          </div>
        )}

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Catalogue variant</span>
          <select name="catalogue_variant_id" defaultValue={selectedId(rule?.catalogue_variant_id)} className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent">
            <option value="">Any variant</option>
            {options.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>{optionLabel(variant.label, `Variant ${variant.id}`)}</option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-border bg-bg/45 p-4 md:col-span-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-accent">Advanced fallback filters</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Use these when the catalogue does not have the exact player, set, card, or wording yet.
          </p>
        </div>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Include terms</span>
          <input name="include_terms" defaultValue={textValue(rule?.include_terms)} placeholder="Victor Wembanyama, Wemby" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Exclude terms</span>
          <input name="exclude_terms" defaultValue={textValue(rule?.exclude_terms)} placeholder="break, spot, case" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Brand</span>
          <input name="brand" list={`${listPrefix}-brands`} defaultValue={textValue(rule?.brand)} placeholder="Panini" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          <Datalist id={`${listPrefix}-brands`} values={options.brands} />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Product line / set</span>
          <input name="product_line" list={`${listPrefix}-product-lines`} defaultValue={textValue(rule?.product_line)} placeholder="Prizm" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          <Datalist id={`${listPrefix}-product-lines`} values={options.productLines} />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Season</span>
          <input name="season" list={`${listPrefix}-seasons`} defaultValue={textValue(rule?.season)} placeholder="2023-24" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          <Datalist id={`${listPrefix}-seasons`} values={options.seasons} />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Card number</span>
          <input name="card_number" list={`${listPrefix}-card-numbers`} defaultValue={textValue(rule?.card_number)} placeholder="136" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          <Datalist id={`${listPrefix}-card-numbers`} values={options.cardNumbers} />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Parallel</span>
          <input name="parallel" list={`${listPrefix}-parallels`} defaultValue={textValue(rule?.parallel)} placeholder="Silver" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
          <Datalist id={`${listPrefix}-parallels`} values={options.parallels} />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Minimum confidence</span>
          <input name="minimum_match_confidence" type="number" min="0" max="1" step="0.05" defaultValue={textValue(rule?.minimum_match_confidence ?? 0.75)} className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Min price</span>
          <input name="min_price" type="number" min="0" step="0.01" defaultValue={textValue(rule?.min_price)} placeholder="0" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Max price</span>
          <input name="max_price" type="number" min="0" step="0.01" defaultValue={textValue(rule?.max_price)} placeholder="250" className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent" />
        </label>
      </div>

      <fieldset className="mt-6">
        <legend className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          Optional constraints
        </legend>
        <div className="mt-3 flex flex-wrap gap-3">
          {[
            ["rookie_only", "Rookie only", rule?.rookie_only],
            ["autograph_only", "Autographs", rule?.autograph_only],
            ["relic_only", "Relics", rule?.relic_only],
            ["serial_numbered_only", "Serial numbered", rule?.serial_numbered_only],
            ["graded_only", "Graded", rule?.graded_only],
            ["raw_only", "Raw", rule?.raw_only],
          ].map(([name, label, checked]) => (
            <label key={String(name)} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-text-muted">
              <input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} className="accent-[var(--color-accent)]" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-bg/45 p-4 text-sm text-text-muted">
        <input name="notification_enabled" type="checkbox" defaultChecked={watchlist?.notification_enabled ?? false} className="mt-1 accent-[var(--color-accent)]" />
        <span>
          <span className="block font-mono text-[10px] uppercase tracking-wider text-text">Email alerts</span>
          <span className="mt-1 block leading-6">
            Email me when CardAlarm finds a new card for this watchlist. You can turn this on later.
          </span>
        </span>
      </label>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="submit" className="rounded-full bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover">
          {submitLabel}
        </button>
      </div>
    </>
  );
}
