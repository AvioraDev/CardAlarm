import cron from 'node-cron';
import { getDb, closeDb } from './db';
import { runIngestionCycle } from './ingest';
import { runAvailabilityCheck } from './availability';
import { loadScanSources } from './sources';

async function ingest(): Promise<void> {
  const db = getDb();
  const sources = await loadScanSources(db);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  CardAlarm Ingestion — ${new Date().toLocaleString()}`);
  console.log(`  Sources: ${sources.map(s => s.name).join(', ')}`);
  console.log(`${'═'.repeat(60)}`);
  await runIngestionCycle(db, sources);
}

async function checkAvailability(): Promise<void> {
  const db = getDb();
  const sources = await loadScanSources(db);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  CardAlarm OOS Watchdog — ${new Date().toLocaleString()}`);
  console.log(`${'─'.repeat(60)}`);
  await runAvailabilityCheck(db, sources);
}

// ── Bootstrap ──────────────────────────────────────────────────────

console.log('🟢 CardAlarm Engine starting...');

// Run one immediate ingestion cycle on startup
ingest().catch(err => console.error('Initial ingestion failed:', err));

// Primary ingestion: every 15 minutes
cron.schedule('*/15 * * * *', () => {
  ingest().catch(err => console.error('Ingestion cycle failed:', err));
});

// OOS watchdog: every 30 minutes, offset by 7 min to avoid overlap
cron.schedule('7,37 * * * *', () => {
  checkAvailability().catch(err => console.error('Availability check failed:', err));
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔴 CardAlarm Engine shutting down...');
  await closeDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDb();
  process.exit(0);
});
