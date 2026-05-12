"use server";

import { revalidatePath } from "next/cache";
import { spawn } from "child_process";
import path from "path";
import { requireAdmin, requireUser } from "./auth";
import { execute, query } from "./db";
import type { ScanMode } from "./types";

type MatchFeedbackType = "save" | "unsave" | "dismiss" | "undo_dismiss" | "not_match";

function parseFormId(formData: FormData, key: string): number {
  const rawValue = formData.get(key);
  const parsed = typeof rawValue === "string" ? Number.parseInt(rawValue, 10) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${key}`);
  }
  return parsed;
}

function parseOptionalFormId(formData: FormData, key: string): number | null {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string" || rawValue.trim() === "") return null;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${key}`);
  }
  return parsed;
}

async function assertUserCanAccessProduct(userId: string, storeProductId: number): Promise<void> {
  const rows = await query<{ exists: number }>(
    `select 1 as exists
     from public.watchlist_matches wm
     join public.watchlists w on w.id = wm.watchlist_id
     join public.store_products sp on sp.id = wm.store_product_id
     where w.user_id = $1
       and w.is_active = true
       and sp.is_active = true
       and sp.current_availability = true
       and sp.id = $2
     limit 1`,
    [userId, storeProductId],
  );

  if (!rows[0]) {
    throw new Error("Card is not available in your watchlist matches.");
  }
}

async function assertProductCardMatchBelongsToProduct(
  productCardMatchId: number | null,
  storeProductId: number,
): Promise<void> {
  if (productCardMatchId === null) return;

  const rows = await query<{ exists: number }>(
    `select 1 as exists
     from public.product_card_matches
     where id = $1
       and store_product_id = $2
     limit 1`,
    [productCardMatchId, storeProductId],
  );

  if (!rows[0]) {
    throw new Error("Match does not belong to this card.");
  }
}

async function writeMatchFeedback(formData: FormData, feedbackType: MatchFeedbackType): Promise<void> {
  const user = await requireUser();
  const storeProductId = parseFormId(formData, "storeProductId");
  const productCardMatchId = parseOptionalFormId(formData, "productCardMatchId");

  await assertUserCanAccessProduct(user.id, storeProductId);
  await assertProductCardMatchBelongsToProduct(productCardMatchId, storeProductId);
  await execute(
    `insert into public.match_feedback (
       user_id,
       store_product_id,
       product_card_match_id,
       feedback_type
     ) values ($1, $2, $3, $4)`,
    [user.id, storeProductId, productCardMatchId, feedbackType],
  );

  revalidatePath("/dashboard");
  revalidatePath("/saved");
}

export async function saveCardAction(formData: FormData): Promise<void> {
  await writeMatchFeedback(formData, "save");
}

export async function unsaveCardAction(formData: FormData): Promise<void> {
  await writeMatchFeedback(formData, "unsave");
}

export async function dismissCardAction(formData: FormData): Promise<void> {
  await writeMatchFeedback(formData, "dismiss");
}

export async function undoDismissCardAction(formData: FormData): Promise<void> {
  await writeMatchFeedback(formData, "undo_dismiss");
}

export async function notMatchCardAction(formData: FormData): Promise<void> {
  await writeMatchFeedback(formData, "not_match");
}

export async function startScan(mode: ScanMode): Promise<{ error?: string }> {
  // Architecture boundary: external store scans are admin/system controlled only.
  // Customer actions update watchlists and backfill against cached store_products;
  // they must never spawn scanner processes or call external storefronts.
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
  revalidatePath("/admin/scans");
  return {};
}
