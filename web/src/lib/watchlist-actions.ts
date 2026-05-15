"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { enqueueAndProcessWatchlistAlerts } from "./alerts";
import { backfillWatchlist } from "./watchlist-backfill";
import {
  parseBooleanState,
  isGenericRookieWatchlistTerm,
  parsePositiveFormId,
  parseWatchlistForm,
} from "./watchlist-form";
import { createClient } from "./supabase/server";

// Architecture boundary: user watchlist mutations only reconcile against cached
// store_products. They do not trigger store scans or external storefront calls.

function actionErrorPath(path: string, message: string): string {
  return `${path}?error=${encodeURIComponent(message)}`;
}

async function requireOwnedWatchlist(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  watchlistId: number,
): Promise<void> {
  const { data, error } = await supabase
    .from("watchlists")
    .select("id")
    .eq("id", watchlistId)
    .eq("user_id", userId)
    .maybeSingle<{ id: number }>();

  if (error || !data) redirect(actionErrorPath("/watchlists", "Watchlist not found."));
}

export async function createWatchlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const parsed = parseWatchlistForm(formData);

  if (!parsed.ok) redirect(actionErrorPath("/watchlists/new", parsed.error));

  const watchlistInput = parsed.value;

  const { data: watchlist, error: watchlistError } = await supabase
    .from("watchlists")
    .insert({
      user_id: user.id,
      name: watchlistInput.name,
      is_active: true,
      notification_enabled: watchlistInput.notificationEnabled,
    })
    .select("id")
    .single<{ id: number }>();

  if (watchlistError) redirect(actionErrorPath("/watchlists/new", "Unable to create watchlist."));

  const { error: ruleError } = await supabase.from("watchlist_rules").insert({
    watchlist_id: watchlist.id,
    brand: watchlistInput.brand,
    product_line: watchlistInput.productLine,
    season: watchlistInput.season,
    card_number: watchlistInput.cardNumber,
    parallel: watchlistInput.parallel,
    rookie_only: watchlistInput.rookieOnly,
    autograph_only: watchlistInput.autographOnly,
    relic_only: watchlistInput.relicOnly,
    serial_numbered_only: watchlistInput.serialNumberedOnly,
    graded_only: watchlistInput.gradedOnly,
    raw_only: watchlistInput.rawOnly,
    min_price: watchlistInput.minPrice,
    max_price: watchlistInput.maxPrice,
    currency: watchlistInput.currency,
    include_terms:
      watchlistInput.includeTerms ??
      (watchlistInput.rookieOnly && isGenericRookieWatchlistTerm(watchlistInput.name)
        ? null
        : watchlistInput.name),
    exclude_terms: watchlistInput.excludeTerms,
    minimum_match_confidence: watchlistInput.minimumMatchConfidence,
  });

  if (ruleError) redirect(actionErrorPath("/watchlists/new", "Unable to create watchlist filter."));

  await backfillWatchlist(user.id, watchlist.id);
  await enqueueAndProcessWatchlistAlerts(watchlist.id);
  revalidatePath("/watchlists");
  revalidatePath("/dashboard");
  redirect(`/watchlists/${watchlist.id}`);
}

export async function toggleUserWatchlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const watchlistId = parsePositiveFormId(formData, "watchlistId");
  const isActive = parseBooleanState(formData, "isActive");

  if (watchlistId === null || isActive === null) redirect(actionErrorPath("/watchlists", "Invalid watchlist request."));
  await requireOwnedWatchlist(supabase, user.id, watchlistId);

  const { error } = await supabase
    .from("watchlists")
    .update({ is_active: !isActive })
    .eq("id", watchlistId)
    .eq("user_id", user.id);

  if (error) redirect(actionErrorPath("/watchlists", "Unable to update watchlist."));
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
  const watchlistId = parsePositiveFormId(formData, "watchlistId");
  const notificationsEnabled = parseBooleanState(formData, "notificationsEnabled");

  if (watchlistId === null || notificationsEnabled === null) redirect(actionErrorPath("/watchlists", "Invalid watchlist request."));
  await requireOwnedWatchlist(supabase, user.id, watchlistId);

  const { error } = await supabase
    .from("watchlists")
    .update({ notification_enabled: !notificationsEnabled })
    .eq("id", watchlistId)
    .eq("user_id", user.id);

  if (error) redirect(actionErrorPath("/watchlists", "Unable to update alert setting."));
  if (!notificationsEnabled) await enqueueAndProcessWatchlistAlerts(watchlistId);

  revalidatePath("/watchlists");
  revalidatePath(`/watchlists/${watchlistId}`);
  revalidatePath("/dashboard");
}

export async function backfillUserWatchlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const watchlistId = parsePositiveFormId(formData, "watchlistId");

  if (watchlistId === null) redirect(actionErrorPath("/watchlists", "Invalid watchlist request."));
  await requireOwnedWatchlist(supabase, user.id, watchlistId);

  await backfillWatchlist(user.id, watchlistId);
  await enqueueAndProcessWatchlistAlerts(watchlistId);
  revalidatePath("/watchlists");
  revalidatePath(`/watchlists/${watchlistId}`);
  revalidatePath("/dashboard");
}

export async function refreshAllUserWatchlistsAction(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: watchlists, error } = await supabase
    .from("watchlists")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .returns<{ id: number }[]>();

  if (error) redirect(actionErrorPath("/dashboard", "Unable to refresh watchlists."));

  for (const watchlist of watchlists ?? []) {
    await backfillWatchlist(user.id, watchlist.id);
    await enqueueAndProcessWatchlistAlerts(watchlist.id);
  }

  revalidatePath("/watchlists");
  revalidatePath("/dashboard");
}

export async function deleteUserWatchlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const watchlistId = parsePositiveFormId(formData, "watchlistId");

  if (watchlistId === null) redirect(actionErrorPath("/watchlists", "Invalid watchlist request."));
  await requireOwnedWatchlist(supabase, user.id, watchlistId);

  const { error } = await supabase.from("watchlists").delete().eq("id", watchlistId).eq("user_id", user.id);
  if (error) redirect(actionErrorPath("/watchlists", "Unable to delete watchlist."));

  revalidatePath("/watchlists");
  redirect("/watchlists");
}
