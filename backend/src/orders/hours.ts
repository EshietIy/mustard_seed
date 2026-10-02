/** Wall-clock "HH:MM" in the given IANA timezone (Africa/Lagos = WAT, UTC+1, no DST). */
export function localTime(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

export interface OrderingHours {
  /** "HH:MM" or "HH:MM:SS" */
  opensAt: string;
  onlineOrdersCloseAt: string;
  timezone: string;
}

/** Online orders are accepted from opening time up to (not including) the cut-off. */
export function isOrderingOpen(hours: OrderingHours, now: Date): boolean {
  const t = localTime(now, hours.timezone);
  return t >= hours.opensAt.slice(0, 5) && t < hours.onlineOrdersCloseAt.slice(0, 5);
}

/** "08:00" → "8am", "22:30" → "10:30pm" (for customer-facing messages). */
export function formatClock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.slice(0, 5).split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}
