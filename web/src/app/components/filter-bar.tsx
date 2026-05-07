"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import type { FilterFacets, FilterOptions } from "@/lib/types";

interface FilterBarProps {
  facets: FilterFacets;
  activeFilters: FilterOptions;
  totalUnfiltered: number;
  totalFiltered: number;
}

export function FilterBar({
  facets,
  activeFilters,
  totalUnfiltered,
  totalFiltered,
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isExpanded, setIsExpanded] = useState(
    Object.keys(activeFilters).length > 0
  );

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const clearAll = useCallback(() => {
    const mode = searchParams.get("mode");
    router.push(mode ? `${pathname}?mode=${mode}` : pathname);
  }, [router, pathname, searchParams]);

  const activeCount = Object.values(activeFilters).filter(Boolean).length;
  const isFiltered = activeCount > 0;

  return (
    <div className="rounded-3xl border border-border bg-card shadow-card">
      {/* Toggle Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-surface-hover md:px-5"
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-text">
            Filters
          </span>
          {isFiltered && (
            <span className="font-mono text-[10px] px-2 py-0.5 bg-accent/10 text-accent border border-accent/30">
              {activeCount} active
            </span>
          )}
          {isFiltered && (
            <span className="font-mono text-[10px] text-text-muted">
              {totalFiltered} / {totalUnfiltered} results
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-text-muted">
          {isExpanded ? "Hide" : "Show"}
        </span>
      </button>

      {/* Filter Grid */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-4 md:px-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {/* Source */}
            <FilterSelect
              label="Source"
              value={activeFilters.source}
              options={facets.sources}
              onChange={(v) => updateFilter("source", v)}
            />

            {/* Category */}
            <FilterSelect
              label="Category"
              value={activeFilters.category}
              options={facets.categories}
              onChange={(v) => updateFilter("category", v)}
            />

            {/* Year */}
            <FilterSelect
              label="Year"
              value={activeFilters.year}
              options={facets.years}
              onChange={(v) => updateFilter("year", v)}
            />

            {/* Player */}
            <FilterSelect
              label="Player"
              value={activeFilters.player}
              options={facets.players}
              onChange={(v) => updateFilter("player", v)}
            />

            {/* Set */}
            <FilterSelect
              label="Set"
              value={activeFilters.setName}
              options={facets.setNames}
              onChange={(v) => updateFilter("setName", v)}
            />

            {/* Variant */}
            <FilterSelect
              label="Variant"
              value={activeFilters.variant}
              options={facets.variants}
              onChange={(v) => updateFilter("variant", v)}
            />

            {/* Match Type */}
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
          </div>

          {/* Toggle Row */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <FilterToggle
              label="Watchlist"
              paramKey="watchlistOnly"
              value={activeFilters.watchlistOnly}
              onChange={(v) => updateFilter("watchlistOnly", v)}
            />
            <FilterToggle
              label="Serialized"
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
            <div className="flex items-center gap-1 md:ml-auto">
              <label className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                Price
              </label>
              <input
                type="number"
                placeholder="Min"
                defaultValue={activeFilters.priceMin || ""}
                onBlur={(e) => updateFilter("priceMin", e.target.value)}
                className="w-16 bg-bg border border-border px-2 py-1 font-mono text-xs text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
              <span className="font-mono text-xs text-text-muted">–</span>
              <input
                type="number"
                placeholder="Max"
                defaultValue={activeFilters.priceMax || ""}
                onBlur={(e) => updateFilter("priceMax", e.target.value)}
                className="w-16 bg-bg border border-border px-2 py-1 font-mono text-xs text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
            </div>

            {/* Search */}
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="Search titles..."
                defaultValue={activeFilters.search || ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateFilter("search", (e.target as HTMLInputElement).value);
                  }
                }}
                onBlur={(e) => updateFilter("search", e.target.value)}
                className="w-40 bg-bg border border-border px-2 py-1 font-mono text-xs text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
            </div>

            {/* Clear All */}
            {isFiltered && (
              <button
                onClick={clearAll}
                className="font-mono text-[10px] uppercase tracking-wider text-danger hover:bg-danger hover:text-bg px-2 py-1 border border-danger/30 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

interface FilterSelectProps {
  label: string;
  value?: string;
  options: { value: string; count: number }[];
  onChange: (value: string) => void;
  hideCounts?: boolean;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  hideCounts,
}: FilterSelectProps) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1">
        {label}
      </label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg border border-border px-2 py-1.5 font-mono text-xs text-text focus:border-accent focus:outline-none appearance-none cursor-pointer"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.value}
            {!hideCounts && opt.count > 0 ? ` (${opt.count})` : ""}
          </option>
        ))}
      </select>
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
  // Three states: unset (all), "1" (yes), "0" (no)
  const cycle = () => {
    if (!value) onChange("1");
    else if (value === "1") onChange("0");
    else onChange("");
  };

  return (
    <button
      onClick={cycle}
      className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 border transition-colors ${
        value === "1"
          ? "text-accent border-accent/30 bg-accent/10"
          : value === "0"
            ? "text-danger border-danger/30 bg-danger/10"
            : "text-text-muted border-border hover:border-border-strong"
      }`}
    >
      {label}
      {value === "1" && " ✓"}
      {value === "0" && " ✗"}
    </button>
  );
}
