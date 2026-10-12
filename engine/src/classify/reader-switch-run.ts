import fs from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '../db';
import { classifierReader } from '../classifier-reader';
import { reconcileActiveWatchlistMatches } from '../watchlist-reconciliation';
import { enqueueAlertCandidates, processPendingAlerts } from '../alerts';
import { checkCoverage } from './coverage-check';
import { otherListingsSql } from '../../../web/src/lib/other-listings-sql';

/**
 * One reader switch (D-008, CAR-94): reconcile watchlist matches with the reader the environment selects, with email
 * forced to "log" for this process, and report what changed. Run it once per direction:
 *
 *   CARDALARM_CLASSIFIER_READER=jev|standard npx tsx --env-file=web/.env.local engine/src/classify/reader-switch-run.ts <label>
 *
 * Reports, before and after: live listings without a current-version row, each active watchlist's confirmed and
 * possible matches and its "Other listings", and every alert the reconcile enqueued (what would have fired).
 * Email is never sent: CARDALARM_EMAIL_MODE is set to "log" here and nothing is written to any .env file.
 */

async function main(): Promise<void> {
  const label = process.argv[2] ?? 'switch';
  const reader = classifierReader();
  const previousMode = process.env.CARDALARM_EMAIL_MODE;
  process.env.CARDALARM_EMAIL_MODE = 'log';
  const db = getDb();
  try {
    const started = (await db.query<{ now: Date }>('select clock_timestamp() as now')).rows[0]!.now;
    const coverageBefore = await checkCoverage(db);

    const snapshot = async () =>
      (
        await db.query<{ id: string; name: string; user_id: string; player_id: string | null; confirmed: number; possible: number; alerts: number }>(
          `select w.id::text id, w.name, w.user_id::text user_id,
                  (select wr.player_id::text from public.watchlist_rules wr where wr.watchlist_id = w.id and wr.player_id is not null limit 1) player_id,
                  (select count(*) from public.watchlist_matches wm where wm.watchlist_id = w.id and wm.status = 'current')::int confirmed,
                  (select count(*) from public.watchlist_matches wm where wm.watchlist_id = w.id and wm.status = 'possible')::int possible,
                  (select count(*) from public.alerts a where a.watchlist_id = w.id)::int alerts
           from public.watchlists w where w.is_active order by w.id`
        )
      ).rows;
    const before = await snapshot();

    const matchesUpserted = await reconcileActiveWatchlistMatches(db);
    const enqueued = await enqueueAlertCandidates(db);
    const wouldHaveFired = (
      await db.query<{ watchlist: string; title: string; store: string; price: string | null; match_status: string | null; status: string }>(
        `select w.name watchlist, a.payload->>'productTitle' title, a.payload->>'source' store, a.payload->>'price' price,
                a.payload->>'matchStatus' match_status, a.status
         from public.alerts a join public.watchlists w on w.id = a.watchlist_id
         where a.created_at >= $1 order by w.id, a.id`,
        [started]
      )
    ).rows;
    // Log mode: processing writes the message to the log instead of sending it.
    const processed = await processPendingAlerts(db);

    const after = await snapshot();
    const other: Record<string, number> = {};
    for (const watchlist of after) {
      if (!watchlist.player_id) continue;
      const rows = await db.query<{ total: number }>(otherListingsSql(), [Number(watchlist.id), watchlist.user_id, (await import('../classify/classifier')).JEV_CLASSIFIER_VERSION, 1000]);
      other[watchlist.name] = rows.rows[0]?.total ?? 0;
    }
    const coverageAfter = await checkCoverage(db);

    const report = {
      label,
      reader,
      emailModeDuringRun: 'log',
      emailModeBefore: previousMode ?? '(unset)',
      coverage: { before: coverageBefore, after: coverageAfter },
      matchesUpserted,
      alertsEnqueued: enqueued,
      alertsProcessedInLogMode: processed,
      watchlists: after.map(watchlist => {
        const was = before.find(item => item.id === watchlist.id)!;
        return {
          watchlist: watchlist.name,
          confirmed: { before: was.confirmed, after: watchlist.confirmed },
          possible: { before: was.possible, after: watchlist.possible },
          otherListings: other[watchlist.name] ?? null,
          alertRows: { before: was.alerts, after: watchlist.alerts },
        };
      }),
      wouldHaveFired,
    };
    console.log(JSON.stringify(report, null, 2));
    const out = path.resolve(`docs/accuracy/reader-switch-${label}.json`);
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  } finally {
    if (previousMode === undefined) delete process.env.CARDALARM_EMAIL_MODE;
    else process.env.CARDALARM_EMAIL_MODE = previousMode;
    await closeDb();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
