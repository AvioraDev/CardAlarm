/**
 * CAR-91 / D-005: listings that name a watched player but match no catalogue product.
 *
 * The query selects the store's own words and nothing the catalogue would have to vouch for: no set, parallel,
 * card number or autograph status. It reads the Jev classification (status "unmatched" with a recognised player) only
 * to find the listings; none of its fields are returned. It never touches the alerts tables.
 */

import { JEV_READER_VERSION } from "./classifier-reader";

/** The classifier version whose rows this section reads: the version the readers read. */
export const OTHER_LISTINGS_CLASSIFIER_VERSION = JEV_READER_VERSION;

export const OTHER_LISTINGS_LIMIT = 12;

export interface OtherListingRow {
  id: number;
  title: string;
  price: number | null;
  currency: string | null;
  url: string;
  image_url: string;
  store_name: string;
  total: number;
}

/**
 * $1 watchlist id, $2 user id, $3 classifier version, $4 limit. Ownership is checked in the query itself: a watchlist
 * that is not the user's returns no rows.
 */
export function otherListingsSql(): string {
  return `select sp.id,
       coalesce(sp.title, 'Untitled listing') as title,
       sp.current_price::float8 as price,
       st.currency as currency,
       coalesce(sp.product_url, sp.canonical_url, '') as url,
       coalesce(sp.image_url, '') as image_url,
       coalesce(st.name, sp.source) as store_name,
       count(*) over ()::int as total
     from public.watchlists w
     join public.watchlist_rules wr on wr.watchlist_id = w.id and wr.player_id is not null
     join public.product_classifications pc
       on pc.player_id = wr.player_id
      and pc.classifier_type = 'jev'
      and pc.classifier_version = $3
      and pc.review_status = 'unmatched'
     join public.store_products sp on sp.id = pc.store_product_id and sp.is_active and sp.current_availability
     join public.stores st on st.id = sp.store_id and st.is_active
     where w.id = $1 and w.user_id = $2
     order by sp.last_checked_at desc nulls last, sp.id desc
     limit $4`;
}
