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
