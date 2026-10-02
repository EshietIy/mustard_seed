import { describe, expect, it } from 'vitest';
import { formatNaira, formatTime, formatWatClock, priceLabel, PRICE_PLACEHOLDER } from './format';

describe('formatNaira', () => {
  it.each([
    [150000, '₦1,500'],
    [1250000, '₦12,500'],
    [5000, '₦50'],
    [12345, '₦123.45'],
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
