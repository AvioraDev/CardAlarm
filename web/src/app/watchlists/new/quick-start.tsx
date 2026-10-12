import Link from "next/link";
import { SubmitButton } from "@/app/components/submit-button";
import type { CatalogueOption } from "@/lib/catalogue-options";

export function QuickStartPlayerPicker({ query, results }: { query: string | null; results: CatalogueOption[] }) {
  return (
    <div className="mt-6 space-y-4">
      <form method="get" action="/watchlists/new" className="space-y-3" role="search">
        <input type="hidden" name="quick" value="1" />
        <label className="block">
          <span className="field-label">Search for a player</span>
          <input
            name="q"
            type="search"
            required
            minLength={2}
            maxLength={60}
            defaultValue={query ?? ""}
            placeholder="Start typing a name, like Wembanyama"
            autoComplete="off"
            className="field"
          />
        </label>
        <SubmitButton className="btn btn-primary w-full" pendingLabel="Searching…">
          Search
        </SubmitButton>
      </form>

      {query ? (
        results.length > 0 ? (
          <ul aria-label="Players found" className="divide-y divide-border overflow-hidden rounded-card border border-border">
            {results.map((player) => (
              <li key={player.id}>
                <Link
                  href={`/watchlists/new?quick=1&playerId=${player.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-text hover:bg-mat"
                >
                  <span>{player.label}</span>
                  <span aria-hidden="true" className="text-text-muted">Watch</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="text-[0.875rem] text-text-muted">
            No players match &ldquo;{query}&rdquo;. Check the spelling, or try just the surname.
          </p>
        )
      ) : (
        <p className="text-[0.875rem] text-text-muted">Type at least two letters of a first or last name.</p>
      )}
    </div>
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
