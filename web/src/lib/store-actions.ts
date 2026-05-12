"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "./auth";
import { execute, query } from "./db";
import { parseStoreForm } from "./store-form";

function errorPath(path: string, message: string): string {
  return `${path}?error=${encodeURIComponent(message)}`;
}

async function slugExists(slug: string, excludeId?: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `select id from public.stores where slug = $1 and ($2::bigint is null or id != $2::bigint) limit 1`,
    [slug, excludeId ?? null],
  );
  return rows.length > 0;
}

function parseStoreId(formData: FormData): number | null {
  const value = formData.get("id");
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value.trim())) return null;
  return Number.parseInt(value, 10);
}

export async function createStoreAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = parseStoreForm(formData);
  if (!parsed.ok) redirect(errorPath("/admin/stores/new", parsed.error));

  const store = parsed.value;
  if (await slugExists(store.slug)) redirect(errorPath("/admin/stores/new", "Store slug already exists."));

  await execute(
    `insert into public.stores (
       slug,
       name,
       base_url,
       source_type,
       country_code,
       currency,
       is_active,
       scan_frequency_minutes,
       scan_strategy,
       early_stop_enabled,
       early_stop_unchanged_pages
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      store.slug,
      store.name,
      store.baseUrl,
      store.sourceType,
      store.countryCode,
      store.currency,
      store.isActive,
      store.scanFrequencyMinutes,
      store.scanStrategy,
      store.earlyStopEnabled,
      store.earlyStopUnchangedPages,
    ],
  );

  revalidatePath("/admin/stores");
  redirect("/admin/stores");
}

export async function updateStoreAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = parseStoreId(formData);
  if (id === null) redirect(errorPath("/admin/stores", "Invalid store id."));

  const parsed = parseStoreForm(formData);
  if (!parsed.ok) redirect(errorPath(`/admin/stores/${id}/edit`, parsed.error));

  const store = parsed.value;
  if (await slugExists(store.slug, id)) redirect(errorPath(`/admin/stores/${id}/edit`, "Store slug already exists."));

  await execute(
    `update public.stores
     set slug = $1,
         name = $2,
         base_url = $3,
         source_type = $4,
         country_code = $5,
         currency = $6,
         is_active = $7,
         scan_frequency_minutes = $8,
         scan_strategy = $9,
         early_stop_enabled = $10,
         early_stop_unchanged_pages = $11,
         updated_at = now()
     where id = $12`,
    [
      store.slug,
      store.name,
      store.baseUrl,
      store.sourceType,
      store.countryCode,
      store.currency,
      store.isActive,
      store.scanFrequencyMinutes,
      store.scanStrategy,
      store.earlyStopEnabled,
      store.earlyStopUnchangedPages,
      id,
    ],
  );

  revalidatePath("/admin/stores");
  redirect("/admin/stores");
}

export async function toggleStoreActiveAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = parseStoreId(formData);
  if (id === null) redirect(errorPath("/admin/stores", "Invalid store id."));

  await execute(
    `update public.stores
     set is_active = not is_active,
         updated_at = now()
     where id = $1`,
    [id],
  );

  revalidatePath("/admin/stores");
}
