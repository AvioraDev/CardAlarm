"use server";

import { revalidatePath } from "next/cache";
import { spawn } from "child_process";
import path from "path";
import { requireAdmin, requireUser } from "./auth";
import { execute, query } from "./db";
import type { ScanMode } from "./types";

export async function dismissListing(id: number): Promise<void> {
  await requireUser();
  await execute("UPDATE listings_feed SET is_dismissed = true WHERE id = $1", [id]);
  revalidatePath("/dashboard");
}

export async function undoDismiss(id: number): Promise<void> {
  await requireUser();
  await execute("UPDATE listings_feed SET is_dismissed = false WHERE id = $1", [id]);
  revalidatePath("/dashboard");
}

export async function addWatchlistEntry(formData: FormData): Promise<void> {
  await requireAdmin();
  const playerName = formData.get("playerName") as string;
  const variants = (formData.get("variants") as string) || "";
  const targetNumbers = (formData.get("targetNumbers") as string) || null;

  if (!playerName?.trim()) return;

  await execute(
    `INSERT INTO watchlist (player_name, variants, target_numbers, is_active)
     VALUES ($1, $2, $3, true)`,
    [playerName.trim(), variants.trim(), targetNumbers?.trim() || null]
  );

  revalidatePath("/admin");
}

export async function removeWatchlistEntry(id: number): Promise<void> {
  await requireAdmin();
  await execute("DELETE FROM watchlist WHERE id = $1", [id]);
  revalidatePath("/admin");
}

export async function toggleWatchlistActive(id: number): Promise<void> {
  await requireAdmin();
  await execute("UPDATE watchlist SET is_active = NOT is_active WHERE id = $1", [id]);
  revalidatePath("/admin");
}

export async function startScan(mode: ScanMode): Promise<{ error?: string }> {
  await requireAdmin();
  const runningRows = await query<{ id: number; started_at: string; is_stale: boolean }>(
    `SELECT id, started_at, started_at < now() - interval '30 minutes' as is_stale
     FROM scan_runs
     WHERE status = 'running'
     ORDER BY started_at DESC
     LIMIT 1`
  );
  const running = runningRows[0];

  if (running) {
    if (running.is_stale) {
      await execute(
        "UPDATE scan_runs SET status = 'failed', error = 'Timed out: stale running scan cleared before new scan', completed_at = now() WHERE id = $1",
        [running.id]
      );
    } else {
      return { error: "A scan is already running." };
    }
  }

  const projectRoot = path.resolve(process.cwd(), "..");
  const scanScript = path.join("engine", "src", "scan.ts");
  const child = spawn("npx", ["tsx", scanScript, "--mode", mode], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    shell: true,
    env: process.env,
  });

  child.unref();
  revalidatePath("/dashboard");
  return {};
}
