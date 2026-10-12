# Plan: switch customer-facing readers from Standard to Jev v3 (D-008, CAR-92)

Status: **plan only. Nothing is switched.** Harry approved the direction on 2026-10-12 ("switch readers to v2, but only after these steps"); the switch itself waits for approval of this plan.

"v2" in the decision means the Jev classifier with catalogue grounding. After the matcher fixes it is `jev-catalogue-v3`; that is what readers will read.

## 1. What readers read today, and what changes

Every customer-facing reader pins Standard (`classifier_type = 'deterministic'`):

| Reader | File and line | Used for |
|---|---|---|
| Watchlist reconciliation | `engine/src/watchlist-reconciliation.ts:46` | creates watchlist matches, which drive alerts |
| Watchlist backfill | `web/src/lib/watchlist-backfill-sql.ts:104` (`productClassificationLateralJoinSql`) | "Refresh matches" |
| Inventory | `web/src/lib/inventory-sql.ts:205` (join), `:235` (set join) | the For You feed and filters |
| Admin scan QA | `web/src/lib/admin-scan-qa.ts:353` | admin only |

Their Jev branches (`pc.classifier_type <> 'jev' or pc.review_status = 'accepted'`, confidence taken from `pc.confidence`) already exist and are dead code while the filter says `deterministic`.

### Change, in one place

Replace the five hard-coded filters with one fragment, `readerClassificationFilterSql()`, generated from a single setting:

- `CARDALARM_CLASSIFIER_READER=standard` (default): `pc.classifier_type = 'deterministic'`. Behaviour is exactly today's.
- `CARDALARM_CLASSIFIER_READER=jev`: `pc.classifier_type = 'jev' and pc.classifier_version = <JEV_CLASSIFIER_VERSION> and pc.review_status in ('accepted','possible')`.

The version is explicit so the extra v1 and v2 rows can never be picked up. One test asserts all five readers use the shared fragment (so none can drift).

### Accepted and possible stay separate (product rule 3)

- `accepted` becomes `current` (a confirmed match); `possible` becomes `possible`, shown in its own tier, never mixed with confirmed.
- The existing dead branch drops `possible` entirely. The plan changes it to include `possible` with `match_status = 'possible'`, because the For You feed already has a "Possible match" tier.
- `unmatched` and `out_of_scope` create no watchlist match. `unmatched` with a recognised player is what CAR-91 ("Other listings for this player", PR #20) shows, with store fields only and no alerts.

## 2. What the customer sees change (from the D-008 evidence)

Of the 8,206 listings Standard calls NBA: 3,677 stay confirmed matches, 215 become possible, 3,972 move to the "Other listings" section, and 302 go out of scope. Player names stop carrying parallel or insert text. Today's production has 2 watchlists and one watched player, so the live effect is small and checkable by hand.

Coverage check (done 2026-10-12): all 12,659 live listings from active stores have both a Standard row and a v3 row, so no listing disappears because it was never classified. **New** listings need the scan worker to classify them with v3; that depends on `CARDALARM_JEV_CLASSIFIER_V2=true` in the worker's environment, which has to be on *before* the readers switch, or newly scanned listings would have no v3 row and vanish from customers' views. This is a hosting setting I cannot see; it is the first thing to check.

## 3. What happens to the old rows

There are 12,659 each of v1 and v2 rows beside the v3 rows. **Keep them for now; do not delete.** They are unreachable by readers (explicit version in the filter), they cost nothing, and they are the audit trail and the rollback evidence. Proposed clean-up, after two weeks on v3 without a rollback: one migration that copies v1 and v2 rows into `product_classifications_archive` and deletes them from the live table. That is irreversible apart from the archive, so it gets its own approval.

## 4. Order of work and checks

1. Confirm the worker environment has `CARDALARM_JEV_CLASSIFIER_V2=true` and a TypeSafe key, so new listings are classified. (Hosting setting.)
2. Merge the shared fragment and the `possible` tier change with the default left at `standard`. No behaviour change. Run the DoD commands.
3. Set `CARDALARM_EMAIL_MODE=log` for the switch window, so any newly created match cannot send real email (a new confirmed match enqueues an alert under the existing `user:watchlist:product` dedupe key).
4. Set `CARDALARM_CLASSIFIER_READER=jev` in the web app and the worker. Restart.
5. Run watchlist reconciliation once. The retire logic (CAR-71) removes matches that stop matching.
6. Check by hand against the one active watchlist: the confirmed matches, the possible tier, the Other listings section, no alert rows created (`select count(*) from alerts where created_at > <switch time>`).
7. Restore `CARDALARM_EMAIL_MODE`.

## 5. Rollback, one step

Set `CARDALARM_CLASSIFIER_READER=standard` (environment change plus restart; no code deploy, no migration) and re-run reconciliation. Standard rows were never touched, so the For You feed and filters are back immediately and reconciliation restores the Standard matches. Alerts already sent cannot be unsent, which is why step 3 exists.

## 6. What this plan does not do

No change to the classifier, the catalogue, or alerts delivery. No deletion. No switch until approved.
