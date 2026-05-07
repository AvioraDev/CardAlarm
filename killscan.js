const db = require('better-sqlite3')('cardalarm.db');
db.prepare(`UPDATE scan_runs SET status = 'failed', error = 'Killed by user' WHERE status = 'running'`).run();
console.log('Marked scan as failed in DB.');
