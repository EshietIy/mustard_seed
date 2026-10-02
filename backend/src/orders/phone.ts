/**
 * Normalises a Nigerian phone number to E.164 (+234XXXXXXXXXX), accepting the ways people
 * usually type it: 0803 123 4567, +234 803 123 4567, 2348031234567, +234 (0) 803 ...
 * Returns null for anything else.
 */
export function normalizeNigerianPhone(input: string): string | null {
  const compact = input.replace(/\(0\)/g, '').replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  let digits = compact.replace(/^\+/, '');
  if (digits.startsWith('234')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  else return null;
  return /^[1-9]\d{9}$/.test(digits) ? `+234${digits}` : null;
}
