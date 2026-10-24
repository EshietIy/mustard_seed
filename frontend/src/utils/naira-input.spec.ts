import { describe, expect, it } from 'vitest';
import { koboToInput, MAX_DISH_KOBO, parseNairaInput } from './naira-input';

describe('parseNairaInput', () => {
  it.each([
    ['1500', 150000],
    ['1,500', 150000],
    ['₦1,500', 150000],
    [' 1 500 ', 150000],
    ['0', 0],
    ['1500.5', 150050],
    ['1500.05', 150005],
    ['100000', 10000000],
  ])('reads %j as %i kobo', (text, kobo) => {
    expect(parseNairaInput(text)).toEqual({ kobo });
  });

  it.each([
    ['', 'Enter a price in naira (0 for no extra cost).'],
    ['   ', 'Enter a price in naira (0 for no extra cost).'],
    ['abc', 'Enter the price as a number, for example 1500.'],
    ['-200', 'Enter the price as a number, for example 1500.'],
    ['1.234', 'Use at most 2 digits after the point.'],
    ['1e5', 'Enter the price as a number, for example 1500.'],
    ['100000.01', 'The price can be at most ₦100,000.'],
  ])('refuses %j', (text, error) => {
    expect(parseNairaInput(text)).toEqual({ error });
  });
});

describe('parseNairaInput for a dish price', () => {
  const dish = { maxKobo: MAX_DISH_KOBO, allowZero: false };

  it('reads a dish price', () => {
    expect(parseNairaInput('4,500', dish)).toEqual({ kobo: 450000 });
    expect(parseNairaInput('1000000', dish)).toEqual({ kobo: 100000000 });
  });

  it.each([
    ['', 'Enter a price in naira.'],
    ['0', 'The price must be more than ₦0.'],
    ['0.00', 'The price must be more than ₦0.'],
    ['1000000.01', 'The price can be at most ₦1,000,000.'],
  ])('refuses %j', (text, error) => {
    expect(parseNairaInput(text, dish)).toEqual({ error });
  });
});

describe('koboToInput', () => {
  it.each([
    [150000, '1500'],
    [150050, '1500.50'],
    [0, '0'],
  ])('shows %i kobo as %j', (kobo, text) => {
    expect(koboToInput(kobo)).toBe(text);
  });
});
