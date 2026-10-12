import "server-only";
import { query } from "./db";
import {
  OTHER_LISTINGS_CLASSIFIER_VERSION,
  OTHER_LISTINGS_LIMIT,
  otherListingsSql,
  type OtherListingRow,
} from "./other-listings-sql";

export interface OtherListings {
  listings: OtherListingRow[];
  total: number;
}

/** Live listings that name the watchlist's player but match no catalogue product. Only the owner's watchlist returns rows. */
export async function getOtherListings(userId: string, watchlistId: number): Promise<OtherListings> {
  const rows = await query<OtherListingRow>(otherListingsSql(), [
    watchlistId,
    userId,
    OTHER_LISTINGS_CLASSIFIER_VERSION,
    OTHER_LISTINGS_LIMIT,
  ]);
  return { listings: rows, total: rows[0]?.total ?? 0 };
}
