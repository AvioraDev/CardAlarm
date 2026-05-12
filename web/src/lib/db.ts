import 'server-only';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

let pool: Pool | null = null;
let localEnvLoaded = false;

const localDbEnvKeys = new Set([
  'DATABASE_POSTGRES_URL_NON_POOLING',
  'DATABASE_URL',
  'POSTGRES_SSL_REJECT_UNAUTHORIZED',
  'PGSSLMODE',
  'POSTGRES_POOL_MAX',
  'CARDALARM_DB_QUERY_TIMING',
  'CARDALARM_DB_QUERY_TIMING_MIN_MS',
]);

function loadLocalEnvFile(): void {
  if (localEnvLoaded || process.env.NODE_ENV === 'production') return;
  localEnvLoaded = true;

  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!localDbEnvKeys.has(key)) continue;

    process.env[key] = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}

function connectionString(): string {
  loadLocalEnvFile();
  const value = process.env.DATABASE_POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_POSTGRES_URL_NON_POOLING or DATABASE_URL is required for CardAlarm web database access');
  }
  return value;
}

function normalizeConnectionString(value: string): string {
  loadLocalEnvFile();
  if (process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false') return value;
  const parsed = new URL(value);
  parsed.searchParams.delete('sslmode');
  return parsed.toString();
}

function dbTarget(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.username}@${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'invalid database url';
  }
}

function queryFingerprint(sql: string): string {
  return createHash('sha256').update(sql.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);
}

function shouldLogQueryTiming(durationMs: number): boolean {
  loadLocalEnvFile();
  if (process.env.CARDALARM_DB_QUERY_TIMING !== 'true') return false;
  const minMs = Number(process.env.CARDALARM_DB_QUERY_TIMING_MIN_MS ?? 0);
  return durationMs >= (Number.isFinite(minMs) ? minMs : 0);
}

function logQueryTiming(sql: string, durationMs: number, rowCount: number | null, ok: boolean): void {
  if (!shouldLogQueryTiming(durationMs)) return;
  console.info('CardAlarm database query timing', {
    target: dbTarget(connectionString()),
    operation: sql.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? 'unknown',
    fingerprint: queryFingerprint(sql),
    durationMs,
    rowCount,
    ok,
  });
}

function elapsedMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

export function getDb(): Pool {
  if (pool) return pool;
  const selectedConnectionString = connectionString();
  pool = new Pool({
    connectionString: normalizeConnectionString(selectedConnectionString),
    ssl: process.env.PGSSLMODE === 'disable'
      ? undefined
      : { rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false' },
    max: Number(process.env.POSTGRES_POOL_MAX ?? 8),
  });
  pool.on('error', (error) => {
    console.error(`CardAlarm database pool error for ${dbTarget(selectedConnectionString)}:`, error.message);
  });
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const startedAt = process.hrtime.bigint();
  try {
    const result = await getDb().query<T>(sql, params);
    logQueryTiming(sql, elapsedMs(startedAt), result.rowCount, true);
    return result.rows;
  } catch (error) {
    logQueryTiming(sql, elapsedMs(startedAt), null, false);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`CardAlarm database query failed for ${dbTarget(connectionString())}: ${message}`);
  }
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  const startedAt = process.hrtime.bigint();
  try {
    const result = await getDb().query(sql, params);
    logQueryTiming(sql, elapsedMs(startedAt), result.rowCount, true);
    return result.rowCount ?? 0;
  } catch (error) {
    logQueryTiming(sql, elapsedMs(startedAt), null, false);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`CardAlarm database mutation failed for ${dbTarget(connectionString())}: ${message}`);
  }
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
