"use client";

import { useTransition } from "react";
import { removeWatchlistEntry, toggleWatchlistActive } from "@/lib/actions";
import type { WatchlistRow } from "@/lib/types";

interface WatchlistTableProps {
  entries: WatchlistRow[];
}

export function WatchlistTable({ entries }: WatchlistTableProps) {
  const [isPending, startTransition] = useTransition();

  function handleToggle(id: number) {
    startTransition(() => {
      toggleWatchlistActive(id);
    });
  }

  function handleRemove(id: number) {
    startTransition(() => {
      removeWatchlistEntry(id);
    });
  }

  if (entries.length === 0) {
    return (
      <div className="border border-border bg-surface px-6 py-10 text-center">
        <p className="font-mono text-sm text-text-muted">
          No watchlist entries. Add a player below.
        </p>
      </div>
    );
  }

  return (
    <div className={`border border-border ${isPending ? "opacity-50 pointer-events-none" : ""}`}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="font-mono text-[10px] uppercase tracking-wider text-text-muted text-left px-4 py-2">
              Player
            </th>
            <th className="font-mono text-[10px] uppercase tracking-wider text-text-muted text-left px-4 py-2">
              Variants
            </th>
            <th className="font-mono text-[10px] uppercase tracking-wider text-text-muted text-left px-4 py-2">
              Target #s
            </th>
            <th className="font-mono text-[10px] uppercase tracking-wider text-text-muted text-center px-4 py-2">
              Status
            </th>
            <th className="font-mono text-[10px] uppercase tracking-wider text-text-muted text-center px-4 py-2">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
              <td className="font-mono text-sm text-text px-4 py-3">
                {entry.player_name}
              </td>
              <td className="font-mono text-xs text-text-muted px-4 py-3">
                {entry.variants || "—"}
              </td>
              <td className="font-mono text-xs text-text-muted px-4 py-3">
                {entry.target_numbers || "—"}
              </td>
              <td className="text-center px-4 py-3">
                <button
                  onClick={() => handleToggle(entry.id)}
                  className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border ${
                    entry.is_active
                      ? "text-accent border-accent/30 bg-accent/10"
                      : "text-text-muted border-border"
                  }`}
                >
                  {entry.is_active ? "Active" : "Paused"}
                </button>
              </td>
              <td className="text-center px-4 py-3">
                <button
                  onClick={() => handleRemove(entry.id)}
                  className="font-mono text-[10px] uppercase tracking-wider text-danger hover:bg-danger hover:text-bg px-2 py-0.5 border border-danger/30 transition-colors"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
