"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { enqueueAndProcessWatchlistAlerts } from "./alerts";
import { backfillWatchlist } from "./watchlist-backfill";
import { createClient } from "./supabase/server";

// Architecture boundary: user watchlist mutations only reconcile against cached
// store_products. They do not trigger store scans or external storefront calls.

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

function formNumber(formData: FormData, key: string): number | null {
  const value = formString(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createWatchlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const name = formString(formData, "name");

  if (!name) redirect("/watchlists/new?error=missing-name");

  const { data: watchlist, error: watchlistError } = await supabase
    .from("watchlists")
    .insert({
      user_id: user.id,
      name,
      is_active: true,
      notification_enabled: formBoolean(formData, "notification_enabled"),
    })
    .select("id")
    .single<{ id: number }>();

  if (watchlistError) redirect(`/watchlists/new?error=${encodeURIComponent(watchlistError.message)}`);

  const minimumConfidence = formNumber(formData, "minimum_match_confidence") ?? 0.75;
  const { error: ruleError } = await supabase.from("watchlist_rules").insert({
    watchlist_id: watchlist.id,
    brand: formString(formData, "brand"),
    product_line: formString(formData, "product_line"),
    season: formString(formData, "season"),
    card_number: formString(formData, "card_number"),
    parallel: formString(formData, "parallel"),
    rookie_only: formBoolean(formData, "rookie_only"),
    autograph_only: formBoolean(formData, "autograph_only"),
    relic_only: formBoolean(formData, "relic_only"),
    serial_numbered_only: formBoolean(formData, "serial_numbered_only"),
    graded_only: formBoolean(formData, "graded_only"),
    raw_only: formBoolean(formData, "raw_only"),
    min_price: formNumber(formData, "min_price"),
    max_price: formNumber(formData, "max_price"),
    currency: formString(formData, "currency") ?? "NZD",
    include_terms: formString(formData, "include_terms") ?? name,
    exclude_terms: formString(formData, "exclude_terms"),
    minimum_match_confidence: Math.min(1, Math.max(0, minimumConfidence)),
  });

  if (ruleError) redirect(`/watchlists/new?error=${encodeURIComponent(ruleError.message)}`);

  await backfillWatchlist(user.id, watchlist.id);
  await enqueueAndProcessWatchlistAlerts(watchlist.id);
  revalidatePath("/watchlists");
  revalidatePath("/dashboard");
  redirect(`/watchlists/${watchlist.id}`);
}

export async function toggleUserWatchlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const watchlistId = Number(formData.get("watchlistId"));
  const isActive = formData.get("isActive") === "true";

  if (!Number.isInteger(watchlistId)) return;

  const { error } = await supabase
    .from("watchlists")
    .update({ is_active: !isActive })
    .eq("id", watchlistId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  if (isActive === false) {
    await backfillWatchlist(user.id, watchlistId);
    await enqueueAndProcessWatchlistAlerts(watchlistId);
  }

  revalidatePath("/watchlists");
  revalidatePath(`/watchlists/${watchlistId}`);
  revalidatePath("/dashboard");
}

export async function toggleWatchlistNotificationsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const watchlistId = Number(formData.get("watchlistId"));
  const notificationsEnabled = formData.get("notificationsEnabled") === "true";

  if (!Number.isInteger(watchlistId)) return;

  const { error } = await supabase
    .from("watchlists")
    .update({ notification_enabled: !notificationsEnabled })
    .eq("id", watchlistId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  if (!notificationsEnabled) await enqueueAndProcessWatchlistAlerts(watchlistId);

  revalidatePath("/watchlists");
  revalidatePath(`/watchlists/${watchlistId}`);
  revalidatePath("/dashboard");
}

export async function backfillUserWatchlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const watchlistId = Number(formData.get("watchlistId"));

  if (!Number.isInteger(watchlistId)) return;

  await backfillWatchlist(user.id, watchlistId);
  await enqueueAndProcessWatchlistAlerts(watchlistId);
  revalidatePath("/watchlists");
  revalidatePath(`/watchlists/${watchlistId}`);
  revalidatePath("/dashboard");
}

export async function deleteUserWatchlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const watchlistId = Number(formData.get("watchlistId"));

  if (!Number.isInteger(watchlistId)) return;

  const { error } = await supabase.from("watchlists").delete().eq("id", watchlistId).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/watchlists");
  redirect("/watchlists");
}
