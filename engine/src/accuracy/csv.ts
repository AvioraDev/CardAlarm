/** Minimal RFC 4180 CSV reader/writer for the labelling sheet (no dependency). */

export function toCsv(rows: string[][]): string {
  const escape = (cell: string) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return rows.map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = input.replace(/^﻿/, '');

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Rows as objects keyed by the header row. Skips fully blank lines. */
export function parseCsvObjects(input: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(input);
  if (!header) return [];
  return rows
    .filter(row => row.some(cell => cell.trim() !== ''))
    .map(row => Object.fromEntries(header.map((name, index) => [name.trim(), row[index] ?? ''])));
}
