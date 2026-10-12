/**
 * What counts as a live listing for customers (CAR-96). One rule, used by every customer-facing reader, alert and
 * the coverage check, the same way the classifier filter is shared.
 *
 * A listing is live when it is active and available AND
 *   - its store is active, and
 *   - the store's last successful scan is recent, and
 *   - the listing itself was seen recently.
 *
 * "Recent" is derived from how often the store is scanned: STALE_AFTER_SCAN_INTERVALS times its
 * scan_frequency_minutes (default 1440, daily), so one missed scan is tolerated and two are not. Stores scan daily today,
 * so the window is 48 hours. If scanning stops, listings go stale after that window and customers see nothing, rather
 * than cards that may have sold: scan-health.ts tells "nothing in stock" from "scans are not running".
 *
 * web/src/lib/live-listing.ts is the same module for the web app; a test asserts they agree.
 */

export const STALE_AFTER_SCAN_INTERVALS = 2;
export const DEFAULT_SCAN_FREQUENCY_MINUTES = 1440;

/** SQL condition for "this store_products row is live". `sp` is the store_products alias. */
export function liveListingSql(sp = "sp"): string {
  const window = `make_interval(mins => ${STALE_AFTER_SCAN_INTERVALS} * coalesce(live_store.scan_frequency_minutes, ${DEFAULT_SCAN_FREQUENCY_MINUTES}))`;
  return `(${sp}.is_active = true and ${sp}.current_availability = true and exists (
       select 1 from public.stores live_store
       where live_store.id = ${sp}.store_id
         and live_store.is_active = true
         and live_store.last_successful_scan_at >= now() - ${window}
         and ${sp}.last_seen_at >= now() - ${window}
     ))`;
}
