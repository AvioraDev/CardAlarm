"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useId, useState } from "react";
import { IconChevron } from "@/app/components/icons";
import type { FilterFacets, FilterOptions } from "@/lib/types";

const FILTER_KEYS_IGNORED_FOR_COUNT = ["watchlistId"];

interface FilterBarProps {
  facets: FilterFacets;
  activeFilters: FilterOptions;
  totalUnfiltered: number;
  totalFiltered: number;
  variant?: "inventory" | "matches";
}

export function FilterBar({
  facets,
  activeFilters,
  totalUnfiltered,
  totalFiltered,
  variant = "inventory",
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCount = Object.entries(activeFilters).filter(
    ([key, value]) => Boolean(value) && !FILTER_KEYS_IGNORED_FOR_COUNT.includes(key)
  ).length;
  // Collapsed by default; open only when a real filter (not the watchlist chip) is active.
  const [isExpanded, setIsExpanded] = useState(activeCount > 0);

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const clearAll = useCallback(() => {
    // Clearing filters keeps the view mode and the selected watchlist.
    const params = new URLSearchParams();
    const mode = searchParams.get("mode");
    const watchlistId = searchParams.get("watchlistId");
    if (mode) params.set("mode", mode);
    if (watchlistId) params.set("watchlistId", watchlistId);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [router, pathname, searchParams]);

  const isFiltered = activeCount > 0;
  const isMatches = variant === "matches";

  return (
    <div className="panel">
      {/* Toggle Header */}
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls="filter-panel"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left md:px-5"
      >
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="section-head text-text">Filters</span>
          {isFiltered && (
            <span className="badge badge-neutral">
              <span className="data">{activeCount}</span> active
            </span>
          )}
          {isFiltered && (
            <span className="text-[0.8125rem] text-text-muted">
              <span className="data">{totalFiltered}</span> of <span className="data">{totalUnfiltered}</span>
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[0.8125rem] text-text-muted">
          {isExpanded ? "Hide" : "Show"}
          <IconChevron className={`transition-transform duration-[120ms] ${isExpanded ? "rotate-180" : ""}`} />
        </span>
      </button>

      {/* Filter Grid */}
      {isExpanded && (
        <div id="filter-panel" className="border-t border-border px-4 py-4 md:px-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <FilterSelect
              label="Store"
              value={activeFilters.source}
              options={facets.sources}
              onChange={(v) => updateFilter("source", v)}
            />

            {!isMatches ? (
              <FilterSelect
                label="Category"
                value={activeFilters.category}
                options={facets.categories}
                onChange={(v) => updateFilter("category", v)}
              />
            ) : null}

            <FilterSelect
              label="Year"
              value={activeFilters.year}
              options={facets.years}
              onChange={(v) => updateFilter("year", v)}
            />

            <FilterSelect
              label="Player"
              value={activeFilters.player}
              options={facets.players}
              onChange={(v) => updateFilter("player", v)}
            />

            {!isMatches ? (
              <FilterSelect
                label="Set"
                value={activeFilters.setName}
                options={facets.setNames}
                onChange={(v) => updateFilter("setName", v)}
              />
            ) : null}

            <FilterSelect
              label="Parallel / variant"
              value={activeFilters.variant}
              options={facets.variants}
              onChange={(v) => updateFilter("variant", v)}
            />

            {isMatches ? (
              <>
                <TextFilter
                  className="col-span-2 md:col-span-1"
                  label="Team"
                  value={activeFilters.team}
                  placeholder="Suns, Lakers…"
                  onChange={(v) => updateFilter("team", v)}
                />
                <FilterSelect
                  label="Status"
                  value={activeFilters.matchStatus}
                  options={[
                    { value: "confirmed", count: 0 },
                    { value: "possible", count: 0 },
                  ]}
                  onChange={(v) => updateFilter("matchStatus", v)}
                  formatLabel={formatMatchStatus}
                  hideCounts
                />
              </>
            ) : (
              <FilterSelect
                label="Match Type"
                value={activeFilters.matchType}
                options={[
                  { value: "Matched", count: 0 },
                  { value: "Cached", count: 0 },
                ]}
                onChange={(v) => updateFilter("matchType", v)}
                hideCounts
              />
            )}
          </div>

          {/* Toggle Row */}
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <FilterToggle
              label="Numbered"
              paramKey="isSerial"
              value={activeFilters.isSerial}
              onChange={(v) => updateFilter("isSerial", v)}
            />
            <FilterToggle
              label="Auto"
              paramKey="isAuto"
              value={activeFilters.isAuto}
              onChange={(v) => updateFilter("isAuto", v)}
            />
            <FilterToggle
              label="Rookie"
              paramKey="isRookie"
              value={activeFilters.isRookie}
              onChange={(v) => updateFilter("isRookie", v)}
            />

            {/* Price Range */}
            <fieldset>
              <legend className="field-label">Price</legend>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Min"
                  aria-label="Minimum price"
                  defaultValue={activeFilters.priceMin || ""}
                  onBlur={(e) => updateFilter("priceMin", e.target.value)}
                  className="field data w-24"
                />
                <span className="text-text-muted" aria-hidden="true">
                  –
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Max"
                  aria-label="Maximum price"
                  defaultValue={activeFilters.priceMax || ""}
                  onBlur={(e) => updateFilter("priceMax", e.target.value)}
                  className="field data w-24"
                />
              </div>
            </fieldset>

            {/* Search */}
            <input
              type="search"
              placeholder="Search cards…"
              aria-label="Search cards"
              defaultValue={activeFilters.search || ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateFilter("search", (e.target as HTMLInputElement).value);
                }
              }}
              onBlur={(e) => updateFilter("search", e.target.value)}
              className="field w-full sm:w-56"
            />

            {isFiltered && (
              <button type="button" onClick={clearAll} className="btn btn-secondary btn-sm">
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatMatchStatus(value: string): string {
  if (value === "confirmed") return "Confirmed";
  if (value === "possible") return "Possible";
  return value;
}

// ─── Sub-components ────────────────────────────────────────────────

interface FilterSelectProps {
  label: string;
  value?: string;
  options: { value: string; count: number }[];
  onChange: (value: string) => void;
  hideCounts?: boolean;
  /** Display text for an option; the stored URL value is unchanged. */
  formatLabel?: (value: string) => string;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  hideCounts,
  formatLabel,
}: FilterSelectProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select
        id={id}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="field cursor-pointer"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {formatLabel ? formatLabel(opt.value) : opt.value}
            {!hideCounts && opt.count > 0 ? ` (${opt.count})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

interface TextFilterProps {
  label: string;
  className?: string;
  value?: string;
  placeholder: string;
  onChange: (value: string) => void;
}

function TextFilter({ label, className, value, placeholder, onChange }: TextFilterProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        defaultValue={value || ""}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") onChange((e.target as HTMLInputElement).value);
        }}
        onBlur={(e) => onChange(e.target.value)}
        className="field"
      />
    </div>
  );
}

interface FilterToggleProps {
  label: string;
  paramKey: string;
  value?: string;
  onChange: (value: string) => void;
}

function FilterToggle({ label, value, onChange }: FilterToggleProps) {
  // Three states: unset (any), "1" (only), "0" (excluded)
  const cycle = () => {
    if (!value) onChange("1");
    else if (value === "1") onChange("0");
    else onChange("");
  };
  const state = value === "1" ? "only" : value === "0" ? "excluded" : "any";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${label}: ${state}`}
      data-state={state === "any" ? undefined : state}
      className="chip"
    >
      {label}
      {state === "only" ? <span className="text-[0.8125rem] font-normal">· only</span> : null}
      {state === "excluded" ? <span className="text-[0.8125rem] font-normal">· hidden</span> : null}
    </button>
  );
}
