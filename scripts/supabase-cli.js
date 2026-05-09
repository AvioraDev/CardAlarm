const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const allowedCommands = new Set(['list', 'push', 'dry-run']);
const command = process.argv[2] ?? 'list';

if (!allowedCommands.has(command)) {
  console.error('Usage: node scripts/supabase-cli.js <list|push|dry-run>');
  process.exit(1);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    process.env[key] = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), 'web', '.env.local'));

const dbUrl = process.env.DATABASE_POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_POSTGRES_URL_NON_POOLING or DATABASE_URL is required.');
  process.exit(1);
}

const supabaseBin = 'supabase';
const argsByCommand = {
  list: ['migration', 'list', '--db-url', dbUrl],
  push: ['db', 'push', '--db-url', dbUrl],
  'dry-run': ['db', 'push', '--db-url', dbUrl, '--dry-run'],
};

const result = spawnSync(supabaseBin, argsByCommand[command], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
