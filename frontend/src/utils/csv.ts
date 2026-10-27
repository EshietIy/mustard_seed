/**
 * Rows as CSV text for spreadsheets. Cells are quoted when needed, and a cell that starts like
 * a formula (= + - @) gets a leading apostrophe so a spreadsheet shows it instead of running it.
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

function cell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
