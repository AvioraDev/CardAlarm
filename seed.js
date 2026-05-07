const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const xlsx = require('xlsx');

// Initialize local SQLite DB file
const db = new Database('cardalarm.db');

console.log('Initializing database schema...');

// Create table with a UNIQUE constraint to prevent duplicates on re-runs
db.exec(`
  CREATE TABLE IF NOT EXISTS reference_checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER,
    set_name TEXT,
    card_number TEXT,
    player_name TEXT,
    UNIQUE(set_name, card_number)
  );
`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO reference_checklists (year, set_name, card_number, player_name) 
  VALUES (?, ?, ?, ?)
`);

// Wrap inserts in a transaction for massive performance gains
const bulkInsert = db.transaction((records) => {
    let count = 0;
    for (const record of records) {
        const info = insertStmt.run(record.year, record.set_name, record.card_number, record.player_name);
        if (info.changes > 0) count++;
    }
    return count;
});

const setsDir = path.join(__dirname, 'docs', 'sets');
const files = fs.readdirSync(setsDir).filter(f => f.endsWith('.xlsx'));

let totalInserted = 0;

for (const file of files) {
    console.log(`\nProcessing: ${file}`);
    const filePath = path.join(setsDir, file);
    const year = file.includes('2025-26') ? 2025 : 2024;
    const isPanini = file.includes('Panini');

    const workbook = xlsx.readFile(filePath);
    const records = [];

    if (isPanini) {
        // Panini files typically have a 'Master' or 'Master Checklist' sheet
        const masterSheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('master'));
        if (!masterSheetName) {
            console.warn(`  ↳ Skipped: No Master Checklist found in ${file}`);
            continue;
        }

        const data = xlsx.utils.sheet_to_json(workbook.Sheets[masterSheetName]);

        for (const row of data) {
            // Find keys dynamically as Panini headers can have trailing spaces
            const setKey = Object.keys(row).find(k => k.trim().toUpperCase() === 'CARD SET');
            const numKey = Object.keys(row).find(k => k.trim().toUpperCase() === 'CARD NUMBER');
            const playerKey = Object.keys(row).find(k => k.trim().toUpperCase() === 'ATHLETE' || k.trim().toUpperCase() === 'PLAYER');

            if (row[setKey] && row[numKey] && row[playerKey]) {
                records.push({
                    year,
                    set_name: String(row[setKey]).trim(),
                    card_number: String(row[numKey]).trim(),
                    player_name: String(row[playerKey]).trim()
                });
            }
        }
    } else {
        // Topps processing (Messier structure, often no Master sheet)
        const sheetsToProcess = workbook.SheetNames.includes('Full Checklist')
            ? ['Full Checklist']
            : workbook.SheetNames.filter(s => s.toLowerCase() !== 'teams');

        for (const sheetName of sheetsToProcess) {
            const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
            let currentSet = sheetName === 'Full Checklist' ? 'Base' : sheetName;

            for (const row of data) {
                if (!row || row.length < 2) continue;

                const col0 = String(row[0] || '').trim();
                const col1 = String(row[1] || '').trim();

                // Identify Set Name headers (Topps puts set names in col 0 with empty col 1)
                if (col0 && !col1 && !col0.toLowerCase().includes('cards') && !col0.toLowerCase().includes('parallels') && col0.length > 3) {
                    currentSet = col0;
                    continue;
                }

                // If both columns have data, and col 0 is a short string (card number), it's a card record
                if (col0 && col1 && col1 !== 'NaN' && col0.length < 15) {
                    records.push({
                        year,
                        set_name: currentSet,
                        card_number: col0,
                        player_name: col1.replace(/,$/, '').trim() // Clean trailing commas
                    });
                }
            }
        }
    }

    const inserted = bulkInsert(records);
    totalInserted += inserted;
    console.log(`  ↳ Found ${records.length} valid rows. Inserted ${inserted} new records.`);
}

console.log(`\n✅ Seeding complete. Total new records inserted into cardalarm.db: ${totalInserted}`);