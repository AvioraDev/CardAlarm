"use server";

import { revalidatePath } from "next/cache";
import { spawn } from "child_process";
import path from "path";
import { getDb } from "./db";
import type { ScanMode } from "./types";

// ─── Listing Mutations ─────────────────────────────────────────────

export async function dismissListing(id: number): Promise<void> {
  const db = getDb();
  db.prepare("UPDATE listings_feed SET is_dismissed = 1 WHERE id = ?").run(id);
  revalidatePath("/");
}

export async function undoDismiss(id: number): Promise<void> {
  const db = getDb();
  db.prepare("UPDATE listings_feed SET is_dismissed = 0 WHERE id = ?").run(id);
  revalidatePath("/");
}

// ─── Watchlist Mutations ───────────────────────────────────────────

export async function addWatchlistEntry(formData: FormData): Promise<void> {
  const playerName = formData.get("playerName") as string;
  const variants = (formData.get("variants") as string) || "";
  const targetNumbers = (formData.get("targetNumbers") as string) || null;

  if (!playerName?.trim()) return;

  const db = getDb();
  db.prepare(
    `INSERT INTO watchlist (player_name, variants, target_numbers, is_active) VALUES (?, ?, ?, 1)`
  ).run(playerName.trim(), variants.trim(), targetNumbers?.trim() || null);

  revalidatePath("/admin");
}

export async function removeWatchlistEntry(id: number): Promise<void> {
  const db = getDb();
  db.prepare("DELETE FROM watchlist WHERE id = ?").run(id);
  revalidatePath("/admin");
}

export async function toggleWatchlistActive(id: number): Promise<void> {
  const db = getDb();
  // Flip: 1→0, 0→1
  db.prepare(
    "UPDATE watchlist SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?"
  ).run(id);
  revalidatePath("/admin");
}

// ─── Scan Engine ───────────────────────────────────────────────────

export async function startScan(mode: ScanMode): Promise<{ error?: string }> {
  const db = getDb();

  // Guard: check if a scan is already running
  const running = db
    .prepare("SELECT id, started_at FROM scan_runs WHERE status = 'running' LIMIT 1")
    .get() as { id: number; started_at: string } | undefined;

  if (running) {
    // If the scan has been "running" for over 10 minutes, it's dead — mark it failed
    const startedMs = new Date(running.started_at + "Z").getTime();
    const staleThresholdMs = 10 * 60 * 1000;

    if (Date.now() - startedMs > staleThresholdMs) {
      db.prepare(
        "UPDATE scan_runs SET status = 'failed', error = 'Timed out', completed_at = datetime('now') WHERE id = ?"
      ).run(running.id);
    } else {
      return { error: "A scan is already running." };
    }
  }

  // Spawn the engine scan process detached so it survives this action returning
  const projectRoot = path.resolve(process.cwd(), "..");
  const scanScript = path.join("engine", "src", "scan.ts");

  const child = spawn("npx", ["tsx", scanScript, "--mode", mode], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    shell: true,
  });

  // Let the child run independently
  child.unref();

  revalidatePath("/");
  return {};
}

