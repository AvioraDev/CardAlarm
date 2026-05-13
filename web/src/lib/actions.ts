"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "./auth";
import { execute, query } from "./db";
import { enqueueScanJob, hasActiveScanJob } from "./scan-jobs";
import type { ScanMode } from "./types";

type MatchFeedbackType = "save" | "unsave" | "dismiss" | "undo_dismiss" | "not_match";

function parseFormId(formData: FormData, key: string): number {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string" || !/^[1-9]\d*$/.test(rawValue.trim())) {
    throw new Error("Invalid card action request.");
  }
  return Number.parseInt(rawValue, 10);
}

function parseOptionalFormId(formData: FormData, key: string): number | null {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string" || rawValue.trim() === "") return null;
  if (!/^[1-9]\d*$/.test(rawValue.trim())) {
    throw new Error("Invalid card action request.");
  }
  return Number.parseInt(rawValue, 10);
}

async function assertUserCanAccessFeedbackTarget(
  userId: string,
  storeProductId: number,
  productCardMatchId: number | null,
): Promise<void> {
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
       and (
         $3::bigint is null
         or exists (
           select 1
           from public.product_card_matches pcm
           where pcm.id = $3::bigint
             and pcm.store_product_id = sp.id
             and (wm.product_card_match_id = pcm.id or wm.product_card_match_id is null)
         )
       )
     limit 1`,
    [userId, storeProductId, productCardMatchId],
  );

  if (!rows[0]) {
    throw new Error("Card is not available in your watchlist matches.");
  }
}

async function writeMatchFeedback(formData: FormData, feedbackType: MatchFeedbackType): Promise<void> {
  const user = await requireUser();
  const storeProductId = parseFormId(formData, "storeProductId");
  const productCardMatchId = parseOptionalFormId(formData, "productCardMatchId");

  await assertUserCanAccessFeedbackTarget(user.id, storeProductId, productCardMatchId);
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
  const admin = await requireAdmin();
  if (mode !== "watchlist" && mode !== "full") return { error: "Invalid scan mode." };
  if (await hasActiveScanJob()) {
    return { error: "A scan is already queued or running." };
  }

  await enqueueScanJob(mode, admin.user_id);
  revalidatePath("/admin/scans");
  return {};
}
