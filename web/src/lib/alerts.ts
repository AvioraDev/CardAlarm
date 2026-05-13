import "server-only";
import { query, transaction } from "./db";

export type AlertStatus = "pending" | "processing" | "sent" | "failed" | "suppressed";
export type EmailMode = "log" | "resend" | "off";

export type AlertRow = {
  id: number;
  recipient_email: string | null;
  subject: string;
  payload: {
    watchlistName?: string;
    productTitle?: string;
    price?: number | string | null;
    source?: string | null;
    url?: string | null;
    matchStatus?: string | null;
    confidence?: number | string | null;
    reasons?: unknown;
  };
  attempts: number;
};

type SendResult = {
  provider: string;
  providerMessageId: string | null;
};

function envInteger(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : fallback;
}

export function alertProcessLimit(): number {
  return envInteger("CARDALARM_ALERT_PROCESS_LIMIT", 25);
}

export function alertMaxAttempts(): number {
  return envInteger("CARDALARM_ALERT_MAX_ATTEMPTS", 3);
}

export function emailMode(): EmailMode {
  const value = (process.env.CARDALARM_EMAIL_MODE ?? "log").toLowerCase();
  if (value === "resend" || value === "off") return value;
  return "log";
}

export function buildAlertDedupeKey(userId: string, watchlistId: number, storeProductId: number): string {
  return `new_watchlist_match:email:${userId}:${watchlistId}:${storeProductId}`;
}

function formatPrice(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "Price unavailable";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(2)}` : String(value);
}

function formatConfidence(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "Unscored";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric * 100)}%` : String(value);
}

function reasonsList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").slice(0, 5).join("\n");
  }
  return "";
}

function alertText(row: AlertRow): string {
  const payload = row.payload ?? {};
  const lines = [
    `Watchlist: ${payload.watchlistName ?? "Watchlist"}`,
    `Card: ${payload.productTitle ?? "Untitled card"}`,
    `Price: ${formatPrice(payload.price)}`,
    `Store: ${payload.source ?? "Unknown store"}`,
    `Match: ${payload.matchStatus ?? "current"} (${formatConfidence(payload.confidence)})`,
    payload.url ? `Open store: ${payload.url}` : null,
  ].filter((line): line is string => Boolean(line));
  const reasons = reasonsList(payload.reasons);
  if (reasons) lines.push(`Reasons:\n${reasons}`);
  return lines.join("\n\n");
}

export async function sendAlertEmail(row: AlertRow): Promise<SendResult> {
  const mode = emailMode();
  if (mode === "off") {
    return { provider: "off", providerMessageId: null };
  }

  if (mode === "log") {
    console.info("[CardAlarm alert email log]", {
      to: row.recipient_email,
      subject: row.subject,
      text: alertText(row),
    });
    return { provider: "log", providerMessageId: `log-${row.id}` };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CARDALARM_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and CARDALARM_EMAIL_FROM are required when CARDALARM_EMAIL_MODE=resend");
  }
  if (!row.recipient_email) {
    throw new Error("Alert recipient email is missing");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: row.recipient_email,
      subject: row.subject,
      text: alertText(row),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body?.message === "string" ? body.message : `Resend returned ${response.status}`);
  }

  return { provider: "resend", providerMessageId: typeof body?.id === "string" ? body.id : null };
}

export async function enqueueWatchlistAlerts(watchlistId: number): Promise<number> {
  return transaction(async (client) => {
    const result = await client.query(
      `insert into public.alerts (
         user_id,
         watchlist_id,
         watchlist_match_id,
         store_product_id,
         product_card_match_id,
         event_type,
         channel,
         status,
         dedupe_key,
         recipient_email,
         subject,
         payload,
         next_attempt_at
       )
       select
         w.user_id,
         w.id,
         wm.id,
         sp.id,
         wm.product_card_match_id,
         'new_watchlist_match',
         'email',
         case when w.notification_enabled then 'pending' else 'suppressed' end,
         'new_watchlist_match:email:' || w.user_id || ':' || w.id || ':' || sp.id,
         au.email,
         'CardAlarm found a match for ' || w.name || ': ' || coalesce(sp.title, 'Untitled card'),
         jsonb_build_object(
           'watchlistName', w.name,
           'productTitle', coalesce(sp.title, 'Untitled card'),
           'price', sp.current_price,
           'source', sp.source,
           'url', coalesce(sp.product_url, sp.canonical_url),
           'matchStatus', coalesce(wm.status, pcm.status),
           'confidence', greatest(coalesce(wm.confidence, 0), coalesce(pcm.confidence, 0)),
           'reasons', coalesce(pcm.match_reasons, '[]'::jsonb)
         ),
         now()
       from public.watchlist_matches wm
       join public.watchlists w on w.id = wm.watchlist_id
       join public.store_products sp on sp.id = wm.store_product_id
       left join public.product_card_matches pcm on pcm.id = wm.product_card_match_id
       left join auth.users au on au.id = w.user_id
       where w.id = $1
         and w.is_active = true
         and sp.is_active = true
         and sp.current_availability = true
       on conflict (dedupe_key) do update set
         status = case
           when public.alerts.status = 'suppressed' and excluded.status = 'pending' then 'pending'
           else public.alerts.status
         end,
         watchlist_match_id = coalesce(excluded.watchlist_match_id, public.alerts.watchlist_match_id),
         product_card_match_id = coalesce(excluded.product_card_match_id, public.alerts.product_card_match_id),
         recipient_email = coalesce(excluded.recipient_email, public.alerts.recipient_email),
         subject = excluded.subject,
         payload = excluded.payload,
         next_attempt_at = case
           when public.alerts.status = 'suppressed' and excluded.status = 'pending' then now()
           else public.alerts.next_attempt_at
         end,
         updated_at = now()
       where public.alerts.status = 'suppressed'
         and excluded.status = 'pending'`,
      [watchlistId],
    );
    return result.rowCount ?? 0;
  });
}

export async function releaseStaleProcessingAlerts(): Promise<number> {
  const rows = await query<{ count: number }>(
    `with released as (
       update public.alerts
       set status = 'failed',
           error_message = coalesce(error_message, 'Alert processing timed out before completion'),
           next_attempt_at = now(),
           updated_at = now()
       where status = 'processing'
         and updated_at < now() - interval '15 minutes'
       returning id
     )
     select count(*)::int as count from released`,
  );
  return rows[0]?.count ?? 0;
}

export async function claimPendingAlerts(
  limit = alertProcessLimit(),
  maxAttempts = alertMaxAttempts(),
): Promise<AlertRow[]> {
  return query<AlertRow>(
    `with claimed as (
       select id
       from public.alerts
       where status in ('pending', 'failed')
         and next_attempt_at <= now()
         and attempts < $2
       order by created_at asc
       limit $1
       for update skip locked
     )
     update public.alerts a
     set status = 'processing',
         attempts = a.attempts + 1,
         updated_at = now()
     from claimed
     where a.id = claimed.id
     returning a.id, a.recipient_email, a.subject, a.payload, a.attempts`,
    [limit, maxAttempts],
  );
}

export async function processPendingAlerts(limit = alertProcessLimit()): Promise<number> {
  await releaseStaleProcessingAlerts();
  const rows = await claimPendingAlerts(limit);

  let processed = 0;
  for (const row of rows) {
    try {
      const result = await sendAlertEmail(row);
      await query(
        `update public.alerts
         set status = 'sent',
             provider = $2,
             provider_message_id = $3,
             error_message = null,
             sent_at = now(),
             updated_at = now()
         where id = $1
           and status = 'processing'`,
        [row.id, result.provider, result.providerMessageId],
      );
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await query(
        `update public.alerts
         set status = 'failed',
             error_message = $2,
             next_attempt_at = now() + interval '15 minutes',
             updated_at = now()
         where id = $1
           and status = 'processing'`,
        [row.id, message],
      );
    }
  }

  return processed;
}

export async function enqueueAndProcessWatchlistAlerts(watchlistId: number): Promise<void> {
  await enqueueWatchlistAlerts(watchlistId);
  await processPendingAlerts();
}
