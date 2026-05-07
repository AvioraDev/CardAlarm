import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from './db';
import { runIngestionCycle } from './ingest';
import { runAvailabilityCheck } from './availability';
import type { SourceConfig } from './types';

const SOURCES_PATH = path.resolve(__dirname, '..', '..', 'sources.json');

function loadSources(): SourceConfig[] {
  const raw = fs.readFileSync(SOURCES_PATH, 'utf-8');
  return JSON.parse(raw) as SourceConfig[];
}

async function ingest(): Promise<void> {
  const db = getDb();
  const sources = loadSources();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  CardAlarm Ingestion — ${new Date().toLocaleString()}`);
  console.log(`  Sources: ${sources.map(s => s.name).join(', ')}`);
  console.log(`${'═'.repeat(60)}`);
  await runIngestionCycle(db, sources);
}

async function checkAvailability(): Promise<void> {
  const db = getDb();
  const sources = loadSources();
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
process.on('SIGINT', () => {
  console.log('\n🔴 CardAlarm Engine shutting down...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDb();
  process.exit(0);
});
