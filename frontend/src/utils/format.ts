/** Shown wherever a real price has not been supplied yet (AGENT.md §1). */
export const PRICE_PLACEHOLDER = '[PRICE]';

const nairaFormat = (digits: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const wholeNaira = nairaFormat(0);
const nairaAndKobo = nairaFormat(2);

/** Integer kobo → "₦12,500" (or "₦800.50" when there are kobo). Money stays in kobo elsewhere. */
export function formatNaira(kobo: number): string {
  return (kobo % 100 === 0 ? wholeNaira : nairaAndKobo).format(kobo / 100);
}

export function priceLabel(kobo: number | null): string {
  return kobo === null ? PRICE_PLACEHOLDER : formatNaira(kobo);
}

/** "08:00" → "8am", "22:30" → "10:30pm" */
export function formatTime(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(hhmm);
  if (!match) return hhmm;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours < 12 ? 'am' : 'pm';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === '00' ? `${h12}${suffix}` : `${h12}:${minutes}${suffix}`;
}

/** ISO timestamp → clock time in Calabar (WAT), e.g. "12:15pm". */
export function formatWatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return formatTime(hhmm);
}

const watDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** ISO timestamp → calendar date in Calabar (WAT), e.g. "25 Oct 2026". */
export function formatWatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : watDate.format(date);
}
