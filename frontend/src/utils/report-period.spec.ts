import { describe, expect, it } from 'vitest';
import { periodDays, periodProblem, presetPeriod, watToday } from './report-period';

describe('watToday', () => {
  it('is the date in Calabar, an hour ahead of UTC', () => {
    expect(watToday(new Date('2026-10-26T22:59:00Z'))).toBe('2026-10-26');
    expect(watToday(new Date('2026-10-26T23:00:00Z'))).toBe('2026-10-27');
  });
});

describe('presetPeriod', () => {
  it.each([
    ['last-7', '2026-10-21', '2026-10-27'],
    ['last-30', '2026-09-28', '2026-10-27'],
    ['this-month', '2026-10-01', '2026-10-27'],
    ['last-month', '2026-09-01', '2026-09-30'],
    ['this-year', '2026-01-01', '2026-10-27'],
  ] as const)('%s ends where it should', (preset, from, to) => {
    expect(presetPeriod(preset, '2026-10-27')).toEqual({ from, to });
  });

  it('finds last month across a new year, and February’s length', () => {
    expect(presetPeriod('last-month', '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(presetPeriod('last-month', '2024-03-10')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
  });
});

describe('periodDays and periodProblem', () => {
  it('counts both ends', () => {
    expect(periodDays({ from: '2026-10-20', to: '2026-10-20' })).toBe(1);
    expect(periodDays({ from: '2024-01-01', to: '2024-12-31' })).toBe(366);
  });

  it.each([
    [{ from: '', to: '2026-10-01' }, 'Choose a start and an end date.'],
    [{ from: '2026-10-07', to: '2026-10-01' }, 'The end date must be on or after the start date.'],
    [{ from: '2025-01-01', to: '2026-01-03' }, 'Choose at most 366 days.'],
    [{ from: 'soon', to: '2026-10-01' }, 'Choose real dates.'],
  ])('explains %o', (period, message) => {
    expect(periodProblem(period)).toBe(message);
  });

  it('accepts a good period', () => {
    expect(periodProblem({ from: '2026-10-01', to: '2026-10-31' })).toBeNull();
  });
});
