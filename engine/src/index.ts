import { closeDb, getDb } from './db';
import { runWorkerLoop } from './worker';

/**
 * Long-running engine entrypoint. Scans are scheduled and claimed through the scan_jobs queue,
 * so this only keeps the worker loop alive.
 */
async function main(): Promise<void> {
  console.log('CardAlarm Engine starting...');
  try {
    await runWorkerLoop(getDb());
  } finally {
    await closeDb();
  }
}

async function shutdown(): Promise<void> {
  console.log('CardAlarm Engine shutting down...');
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(error => {
  console.error('CardAlarm Engine crashed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
