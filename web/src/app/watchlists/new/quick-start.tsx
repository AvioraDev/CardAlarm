import { SubmitButton } from "@/app/components/submit-button";
import type { CatalogueOption } from "@/lib/catalogue-options";

export function QuickStartPlayerPicker({ players }: { players: CatalogueOption[] }) {
  return (
    <form method="get" action="/watchlists/new" className="mt-6 space-y-4">
      <input type="hidden" name="quick" value="1" />
      <label className="block">
        <span className="field-label">Player</span>
        <select name="playerId" required defaultValue="" className="field">
          <option value="" disabled>Choose a player</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>{player.label}</option>
          ))}
        </select>
      </label>
      <SubmitButton className="btn btn-primary w-full" pendingLabel="Loading…">
        Continue
      </SubmitButton>
    </form>
  );
}

const CONSTRAINTS: ReadonlyArray<readonly [string, string]> = [
  ["rookie_only", "Rookies"],
  ["autograph_only", "Autographs"],
  ["serial_numbered_only", "Numbered cards"],
];

export function QuickStartCreateFields({ player }: { player: CatalogueOption }) {
  return (
    <div className="space-y-5">
      <input type="hidden" name="player_id" value={player.id} />
      <input type="hidden" name="after" value="dashboard" />

      <label className="block">
        <span className="field-label">Watchlist name</span>
        <input name="name" required maxLength={120} defaultValue={player.label} className="field" />
      </label>

      <fieldset>
        <legend className="field-label">Only show (optional)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CONSTRAINTS.map(([name, label]) => (
            <label key={name} className="chip">
              <input name={name} type="checkbox" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Min price</span>
          <input name="min_price" type="number" min="0" step="0.01" placeholder="0" className="field data" />
        </label>
        <label className="block">
          <span className="field-label">Max price</span>
          <input name="max_price" type="number" min="0" step="0.01" placeholder="250" className="field data" />
        </label>
      </div>

      <label className="flex items-start gap-3 text-[0.875rem] text-text-muted">
        <input name="notification_enabled" type="checkbox" className="mt-1" />
        <span>Email me when a new match turns up</span>
      </label>

      <SubmitButton className="btn btn-primary w-full" pendingLabel="Finding cards…">
        Start watching
      </SubmitButton>
    </div>
  );
}
