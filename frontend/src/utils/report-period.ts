/** Report periods are whole days in Calabar (WAT), written YYYY-MM-DD, end day included. */
export interface Period {
  from: string;
  to: string;
}

export type Preset =
  | 'today'
  | 'yesterday'
  | 'last-7'
  | 'last-30'
  | 'this-month'
  | 'last-month'
  | 'last-12-months'
  | 'this-year'
  | 'last-year';

export const PRESETS: ReadonlyArray<{ id: Preset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last-7', label: 'Last 7 days' },
  { id: 'last-30', label: 'Last 30 days' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-12-months', label: 'Last 12 months' },
  { id: 'this-year', label: 'This year' },
  { id: 'last-year', label: 'Last year' },
];

/** The API's limit. */
export const MAX_PERIOD_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ms = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Today's date in Calabar. */
export function watToday(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function presetPeriod(preset: Preset, today: string): Period {
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const day = iso(ms(today) - DAY_MS);
      return { from: day, to: day };
    }
    case 'last-7':
      return { from: iso(ms(today) - 6 * DAY_MS), to: today };
    case 'last-30':
      return { from: iso(ms(today) - 29 * DAY_MS), to: today };
    case 'this-month':
      return { from: iso(Date.UTC(y, m - 1, 1)), to: today };
    case 'last-month':
      return { from: iso(Date.UTC(y, m - 2, 1)), to: iso(Date.UTC(y, m - 1, 0)) };
    case 'last-12-months':
      // The day after this date a year ago, so the period is a year long at most.
      return { from: iso(Date.UTC(y - 1, m - 1, d + 1)), to: today };
    case 'this-year':
      return { from: `${y}-01-01`, to: today };
    case 'last-year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

/** Days in the period, both ends included (0 or less when the end is before the start). */
export function periodDays({ from, to }: Period): number {
  return Math.round((ms(to) - ms(from)) / DAY_MS) + 1;
}

/** A message for a period the API would refuse, or null. */
export function periodProblem(period: Period): string | null {
  if (!period.from || !period.to) return 'Choose a start and an end date.';
  const days = periodDays(period);
  if (Number.isNaN(days)) return 'Choose real dates.';
  if (days < 1) return 'The end date must be on or after the start date.';
  if (days > MAX_PERIOD_DAYS) return `Choose at most ${MAX_PERIOD_DAYS} days.`;
  return null;
}
