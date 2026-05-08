import { getDb, closeDb, createScanRun, updateScanRun } from './db';
import { runIngestionCycle } from './ingest';
import { loadScanSources, NO_SCAN_SOURCES_MESSAGE } from './sources';
import type { ScanMode } from './types';

/**
 * On-demand scan entrypoint.
 *
 * Usage:
 *   npx tsx engine/src/scan.ts --mode watchlist
 *   npx tsx engine/src/scan.ts --mode full
 *
 * This is spawned as a child process by the Next.js Server Action.
 * It writes progress to the scan_runs table so the UI can poll status.
 * Exits with code 0 on success, 1 on failure.
 */

function parseMode(): ScanMode {
  const modeIndex = process.argv.indexOf('--mode');
  if (modeIndex === -1 || !process.argv[modeIndex + 1]) {
    console.error('Usage: tsx engine/src/scan.ts --mode <watchlist|full>');
    process.exit(1);
  }
  const mode = process.argv[modeIndex + 1] as string;
  if (mode !== 'watchlist' && mode !== 'full') {
    console.error(`Invalid mode: "${mode}". Must be "watchlist" or "full".`);
    process.exit(1);
  }
  return mode;
}

async function main(): Promise<void> {
  const mode = parseMode();
  const db = getDb();
  const runId = await createScanRun(db, mode);

  try {
    const sources = await loadScanSources(db);
    if (sources.length === 0) throw new Error(NO_SCAN_SOURCES_MESSAGE);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  CardAlarm Scan - ${mode.toUpperCase()} mode`);
    console.log(`  ${new Date().toLocaleString()}`);
    console.log(`  Sources: ${sources.map(s => s.name).join(', ')}`);
    console.log(`${'='.repeat(60)}`);

    const result = await runIngestionCycle(db, sources, {
      mode,
      onProgress: async progress => {
        await updateScanRun(db, runId, progress);
      },
    });

    await updateScanRun(db, runId, {
      processed: result.processed,
      matched: result.matched,
      status: 'completed',
    });

    console.log(`\nScan run #${runId} completed.`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await updateScanRun(db, runId, {
      status: 'failed',
      error: errorMessage,
    });
    console.error(`\nScan run #${runId} failed:`, errorMessage);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main();
