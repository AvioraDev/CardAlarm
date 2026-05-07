"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startScan } from "@/lib/actions";
import type { ScanRunRow, ScanMode } from "@/lib/types";

interface ScanPanelProps {
  initialScanRun: ScanRunRow | null;
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function ScanPanel({ initialScanRun }: ScanPanelProps) {
  const [scanRun, setScanRun] = useState<ScanRunRow | null>(initialScanRun);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const isRunning = scanRun?.status === "running";

  // Poll for status updates while a scan is running
  useEffect(() => {
    if (!isRunning && !isPending) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/scan-status");
        const data = (await res.json()) as { scanRun: ScanRunRow | null };
        setScanRun(data.scanRun);

        // If scan just completed, stop polling
        if (data.scanRun?.status !== "running") {
          clearInterval(interval);
          router.refresh(); // Refresh the feed below
        }
      } catch {
        // Silent fail on poll — will retry next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isRunning, isPending, router]);

  function handleScan(mode: ScanMode) {
    setError(null);
    startTransition(async () => {
      const result = await startScan(mode);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Optimistically show running state
      setScanRun({
        id: -1,
        mode,
        status: "running",
        processed: 0,
        matched: 0,
        error: null,
        started_at: new Date().toISOString(),
        completed_at: null,
      });
    });
  }

  return (
    <div className="border border-border bg-surface mb-4">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: Scan Buttons */}
        <div className="flex items-center gap-2">
          <button
            id="scan-watchlist-btn"
            onClick={() => handleScan("watchlist")}
            disabled={isRunning || isPending}
            className="group flex items-center gap-2 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider bg-accent text-bg hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="inline-block w-2 h-2 bg-bg rounded-full group-disabled:animate-none" />
            Scan Watchlist
          </button>

          <button
            id="scan-all-btn"
            onClick={() => handleScan("full")}
            disabled={isRunning || isPending}
            className="px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider border border-border-strong text-text-muted hover:text-text hover:border-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Scan All
          </button>
        </div>

        {/* Right: Status */}
        <div className="flex items-center gap-3">
          {error && (
            <span className="font-mono text-[10px] text-danger uppercase tracking-wider">
              {error}
            </span>
          )}

          {isRunning && (
            <div className="flex items-center gap-2">
              <span className="scan-pulse inline-block w-2 h-2 rounded-full bg-accent" />
              <span className="font-mono text-[10px] text-accent uppercase tracking-wider">
                Scanning ({scanRun.mode})…
              </span>
              {scanRun.processed > 0 && (
                <span className="font-mono text-[10px] text-text-muted">
                  {scanRun.processed} processed / {scanRun.matched} matched
                </span>
              )}
            </div>
          )}

          {scanRun && scanRun.status === "completed" && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-accent opacity-60" />
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
                Last scan: {scanRun.completed_at ? formatTimeAgo(scanRun.completed_at) : "—"}
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                {scanRun.processed.toLocaleString()} processed ·{" "}
                <span className="text-accent">{scanRun.matched} matched</span>
              </span>
            </div>
          )}

          {scanRun && scanRun.status === "failed" && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-danger" />
              <span className="font-mono text-[10px] text-danger uppercase tracking-wider">
                Scan failed
              </span>
              {scanRun.error && (
                <span className="font-mono text-[10px] text-text-muted truncate max-w-[300px]">
                  {scanRun.error}
                </span>
              )}
            </div>
          )}

          {!scanRun && !isPending && (
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
              No scans yet
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
