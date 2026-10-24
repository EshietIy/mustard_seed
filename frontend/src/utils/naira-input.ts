/** The most a meat or other option may add to a dish (matches the API's limit). */
export const MAX_OPTION_KOBO = 10_000_000;

export type NairaInput = { kobo: number } | { error: string };

/**
 * Reads a price staff typed in naira ("1,500", "₦1500.50") as integer kobo. Money never goes
 * through floating point: the naira and kobo parts are read as whole numbers.
 */
export function parseNairaInput(text: string, maxKobo = MAX_OPTION_KOBO): NairaInput {
  const cleaned = text.replace(/[₦,\s]/g, '');
  if (cleaned === '') return { error: 'Enter a price in naira (0 for no extra cost).' };
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return { error: 'Enter the price as a number, for example 1500.' };
  const fraction = match[2] ?? '';
  if (fraction.length > 2) return { error: 'Use at most 2 digits after the point.' };
  const kobo = Number(match[1]) * 100 + Number(fraction.padEnd(2, '0'));
  if (kobo > maxKobo) {
    return { error: `The price can be at most ₦${(maxKobo / 100).toLocaleString('en-NG')}.` };
  }
  return { kobo };
}

/** Integer kobo as an editable naira value: 150000 → "1500", 150050 → "1500.50". */
export function koboToInput(kobo: number): string {
  const naira = Math.floor(kobo / 100);
  const rest = kobo % 100;
  return rest === 0 ? String(naira) : `${naira}.${String(rest).padStart(2, '0')}`;
}
