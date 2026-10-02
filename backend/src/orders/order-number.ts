/** Sequence value → "#MS-0001". Zero-padded to four digits, growing naturally past 9999. */
export function formatOrderNumber(n: number): string {
  return `#MS-${String(n).padStart(4, '0')}`;
}
