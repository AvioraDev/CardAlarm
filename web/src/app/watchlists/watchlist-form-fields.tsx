import { SubmitButton } from "@/app/components/submit-button";
import type { WatchlistCatalogueOptionFilters, WatchlistCatalogueOptions } from "@/lib/catalogue-options";
import type { UserWatchlistRow, UserWatchlistRuleRow } from "@/lib/types";

type WatchlistFormFieldsProps = {
  options: WatchlistCatalogueOptions;
  selected: WatchlistCatalogueOptionFilters;
  watchlist?: UserWatchlistRow;
  rule?: UserWatchlistRuleRow;
  submitLabel: string;
  defaultName?: string | null;
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
    <form method="get" action={action} className="rounded-card bg-mat p-4 md:p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="field-label">Player</span>
          <select name="playerId" defaultValue={selectedId(selected.playerId)} className="field">
            <option value="">Select a player</option>
            {options.players.map((player) => (
              <option key={player.id} value={player.id}>{player.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Set</span>
          <select name="setId" defaultValue={selectedId(selected.setId)} className="field">
            <option value="">Select a set</option>
            {options.sets.map((set) => (
              <option key={set.id} value={set.id}>{optionLabel(set.label, `Set ${set.id}`)}</option>
            ))}
          </select>
        </label>
        <SubmitButton className="btn btn-secondary">
          Update card choices
        </SubmitButton>
      </div>
      <p className="mt-3 text-[0.8125rem] text-text-muted">
        Pick a player first, then a set, to see specific cards.
      </p>
    </form>
  );
}

export function WatchlistFormFields({ options, selected, watchlist, rule, submitLabel, defaultName }: WatchlistFormFieldsProps) {
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
          <span className="field-label">Watchlist name</span>
          <input
            name="name"
            required
            defaultValue={watchlist?.name ?? defaultName ?? ""}
            placeholder="Victor Wembanyama Prizm rookies"
            className="field"
          />
        </label>

        <div className="border-t border-border pt-5 md:col-span-2">
          <h3 className="section-head text-text">What are you chasing?</h3>
          <p className="text-[0.8125rem] text-text-muted">
            Pick from our NBA card list. Only use the keyword fields below if you can&apos;t find what you&apos;re after.
          </p>
        </div>

        <label className="block">
          <span className="field-label">Player</span>
          <select name="player_id" defaultValue={selectedId(selectedPlayerId)} className="field">
            <option value="">Any player</option>
            {options.players.map((player) => (
              <option key={player.id} value={player.id}>{player.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="field-label">Team</span>
          <select name="team_id" defaultValue={selectedId(rule?.team_id)} className="field">
            <option value="">Any team</option>
            {options.teams.map((team) => (
              <option key={team.id} value={team.id}>{team.label}</option>
            ))}
          </select>
        </label>

        <label className="block md:col-span-2">
          <span className="field-label">Set</span>
          <select name="set_id" defaultValue={selectedId(selectedSetId)} className="field">
            <option value="">Any set</option>
            {options.sets.map((set) => (
              <option key={set.id} value={set.id}>{optionLabel(set.label, `Set ${set.id}`)}</option>
            ))}
          </select>
        </label>

        {canSelectCard ? (
          <label className="block">
            <span className="field-label">Specific card</span>
            <select name="catalogue_card_id" defaultValue={selectedId(selectedCardId)} className="field">
              <option value="">Any card</option>
              {options.cards.map((card) => (
                <option key={card.id} value={card.id}>{optionLabel(card.label, `Card ${card.id}`)}</option>
              ))}
            </select>
          </label>
        ) : (
          <div>
            <p className="field-label">Specific card</p>
            <p className="text-[0.875rem] text-text-muted">Select a player or set first.</p>
            <input type="hidden" name="catalogue_card_id" value="" />
          </div>
        )}

        <label className="block">
          <span className="field-label">Parallel / variant</span>
          <select name="catalogue_variant_id" defaultValue={selectedId(rule?.catalogue_variant_id)} className="field">
            <option value="">Any variant</option>
            {options.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>{optionLabel(variant.label, `Variant ${variant.id}`)}</option>
            ))}
          </select>
        </label>

        <div className="border-t border-border pt-5 md:col-span-2">
          <h3 className="section-head text-text">Keywords and extra filters</h3>
          <p className="text-[0.8125rem] text-text-muted">
            Use these when you can&apos;t find the exact player, set, card or wording in the list above.
          </p>
        </div>

        <label className="block">
          <span className="field-label">Must include words</span>
          <input name="include_terms" defaultValue={textValue(rule?.include_terms)} placeholder="Victor Wembanyama, Wemby" className="field" />
        </label>
        <label className="block">
          <span className="field-label">Leave out words</span>
          <input name="exclude_terms" defaultValue={textValue(rule?.exclude_terms)} placeholder="break, spot, case" className="field" />
        </label>

        <label className="block">
          <span className="field-label">Brand</span>
          <input name="brand" list={`${listPrefix}-brands`} defaultValue={textValue(rule?.brand)} placeholder="Panini" className="field" />
          <Datalist id={`${listPrefix}-brands`} values={options.brands} />
        </label>
        <label className="block">
          <span className="field-label">Product line / set</span>
          <input name="product_line" list={`${listPrefix}-product-lines`} defaultValue={textValue(rule?.product_line)} placeholder="Prizm" className="field" />
          <Datalist id={`${listPrefix}-product-lines`} values={options.productLines} />
        </label>

        <label className="block">
          <span className="field-label">Season</span>
          <input name="season" list={`${listPrefix}-seasons`} defaultValue={textValue(rule?.season)} placeholder="2023-24" className="field" />
          <Datalist id={`${listPrefix}-seasons`} values={options.seasons} />
        </label>
        <label className="block">
          <span className="field-label">Card number</span>
          <input name="card_number" list={`${listPrefix}-card-numbers`} defaultValue={textValue(rule?.card_number)} placeholder="136" className="field" />
          <Datalist id={`${listPrefix}-card-numbers`} values={options.cardNumbers} />
        </label>

        <label className="block">
          <span className="field-label">Parallel</span>
          <input name="parallel" list={`${listPrefix}-parallels`} defaultValue={textValue(rule?.parallel)} placeholder="Silver" className="field" />
          <Datalist id={`${listPrefix}-parallels`} values={options.parallels} />
        </label>
        <label className="block">
          <span className="field-label">Minimum match confidence (0–1)</span>
          <input name="minimum_match_confidence" type="number" min="0" max="1" step="0.05" defaultValue={textValue(rule?.minimum_match_confidence ?? 0.75)} className="field data" />
        </label>

        <label className="block">
          <span className="field-label">Min price</span>
          <input name="min_price" type="number" min="0" step="0.01" defaultValue={textValue(rule?.min_price)} placeholder="0" className="field data" />
        </label>
        <label className="block">
          <span className="field-label">Max price</span>
          <input name="max_price" type="number" min="0" step="0.01" defaultValue={textValue(rule?.max_price)} placeholder="250" className="field data" />
        </label>
      </div>

      <fieldset className="mt-6">
        <legend className="field-label">
          Only show
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            ["rookie_only", "Rookies", rule?.rookie_only],
            ["autograph_only", "Autographs", rule?.autograph_only],
            ["relic_only", "Relics", rule?.relic_only],
            ["serial_numbered_only", "Numbered", rule?.serial_numbered_only],
            ["graded_only", "Graded", rule?.graded_only],
            ["raw_only", "Raw", rule?.raw_only],
          ].map(([name, label, checked]) => (
            <label key={String(name)} className="chip">
              <input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-6 flex items-start gap-3 border-t border-border pt-5 text-[0.875rem] text-text-muted">
        <input name="notification_enabled" type="checkbox" defaultChecked={watchlist?.notification_enabled ?? false} className="mt-1" />
        <span>
          <span className="block font-medium text-text">Email alerts</span>
          <span className="block">
            Email me when CardAlarm finds a new card for this watchlist. You can turn this on later.
          </span>
        </span>
      </label>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <SubmitButton className="btn btn-primary">
          {submitLabel}
        </SubmitButton>
      </div>
    </>
  );
}
