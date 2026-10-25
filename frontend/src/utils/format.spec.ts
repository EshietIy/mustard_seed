import { describe, expect, it } from 'vitest';
import {
  formatNaira,
  formatTime,
  formatWatClock,
  formatWatDate,
  priceLabel,
  PRICE_PLACEHOLDER,
} from './format';

describe('formatNaira', () => {
  it.each([
    [150000, '₦1,500'],
    [1250000, '₦12,500'],
    [5000, '₦50'],
    [12345, '₦123.45'],
    [80050, '₦800.50'],
    [0, '₦0'],
    [100000000, '₦1,000,000'],
  ])('formats %i kobo as %s', (kobo, expected) => {
    expect(formatNaira(kobo)).toBe(expected);
  });
});

describe('priceLabel', () => {
  it('shows the placeholder when the price is not supplied', () => {
    expect(priceLabel(null)).toBe(PRICE_PLACEHOLDER);
    expect(PRICE_PLACEHOLDER).toBe('[PRICE]');
  });

  it('formats a known price', () => {
    expect(priceLabel(450000)).toBe('₦4,500');
  });
});

describe('formatTime', () => {
  it.each([
    ['08:00', '8am'],
    ['23:00', '11pm'],
    ['22:30', '10:30pm'],
    ['12:00', '12pm'],
    ['00:00', '12am'],
    ['12:15', '12:15pm'],
  ])('formats %s as %s', (time, expected) => {
    expect(formatTime(time)).toBe(expected);
  });

  it('returns the input when it is not HH:MM', () => {
    expect(formatTime('late')).toBe('late');
  });
});

describe('formatWatClock', () => {
  it('shows an ISO time as a West Africa Time clock time', () => {
    expect(formatWatClock('2026-10-05T11:15:00.000Z')).toBe('12:15pm');
    expect(formatWatClock('2026-10-05T07:00:00.000Z')).toBe('8am');
  });

  it('returns an empty string for an invalid time', () => {
    expect(formatWatClock('nope')).toBe('');
  });
});

describe('formatWatDate', () => {
  it('shows the calendar date in Lagos time', () => {
    expect(formatWatDate('2026-10-25T09:00:00Z')).toBe('25 Oct 2026');
    // 23:30 UTC is already the next day in Lagos (UTC+1).
    expect(formatWatDate('2026-10-25T23:30:00Z')).toBe('26 Oct 2026');
  });
});
