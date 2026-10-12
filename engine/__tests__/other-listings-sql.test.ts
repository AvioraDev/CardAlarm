import fs from 'node:fs';
import path from 'node:path';
import { OTHER_LISTINGS_CLASSIFIER_VERSION, OTHER_LISTINGS_LIMIT, otherListingsSql } from '../../web/src/lib/other-listings-sql';
import { JEV_CLASSIFIER_VERSION } from '../src/classify/classifier';

/**
 * CAR-91 / D-005: "Other listings for this player". Store fields only, no alerts, the owner's watchlist only.
 */
describe('other listings for a player', () => {
  const sql = otherListingsSql();
  const selectList = sql.slice(0, sql.indexOf('from public.watchlists'));

  it('returns the store\'s own fields and no set, parallel, card number or autograph status', () => {
    for (const field of ['title', 'price', 'currency', 'url', 'image_url', 'store_name']) expect(selectList).toContain(` as ${field}`);
    for (const forbidden of ['set_name', 'parallel', 'variant', 'card_number', 'is_auto', 'is_rookie', 'year', 'product_line', 'player_name', 'confidence', 'review_status']) {
      expect(selectList).not.toContain(forbidden);
    }
  });

  it('only reads unmatched listings of the watched player that are live, from active stores', () => {
    expect(sql).toContain("pc.review_status = 'unmatched'");
    expect(sql).toContain('pc.player_id = wr.player_id');
    expect(sql).toContain('sp.is_active and sp.current_availability');
    expect(sql).toContain('st.is_active');
  });

  it('checks ownership inside the query, so another user\'s watchlist returns nothing', () => {
    expect(sql).toContain('w.id = $1 and w.user_id = $2');
  });

  it('never touches alerts or watchlist matches, so these listings cannot raise an alert', () => {
    expect(sql).not.toMatch(/alerts|watchlist_matches/);
    const section = fs.readFileSync(path.join(__dirname, '../../web/src/app/watchlists/[id]/other-listings.tsx'), 'utf8');
    expect(section).not.toMatch(/@\/lib\/alerts|insert into|update public|delete from/);
  });

  it('reads the same classifier version as the engine writes, and is capped', () => {
    expect(OTHER_LISTINGS_CLASSIFIER_VERSION).toBe(JEV_CLASSIFIER_VERSION);
    expect(OTHER_LISTINGS_LIMIT).toBe(12);
  });

  it('has loading, empty and error states and no internal jargon in its copy', () => {
    const section = fs.readFileSync(path.join(__dirname, '../../web/src/app/watchlists/[id]/other-listings.tsx'), 'utf8');
    expect(section).toContain('SectionLoading');
    expect(section).toContain('Nothing else has turned up');
    expect(section).toContain('role="alert"');
    for (const banned of ['backfill', 'canonical', 'MVP', 'cached listings', 'Serialized', 'unmatched', 'classif']) {
      expect(section.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
});
