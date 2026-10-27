import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(
      toCsv([
        ['Dish', 'Sold'],
        ['Zobo', 4],
      ]),
    ).toBe('Dish,Sold\r\nZobo,4');
  });

  it('quotes cells with commas, quotes or line breaks', () => {
    expect(toCsv([['Rice, beans', 'The "special"', 'a\nb']])).toBe(
      '"Rice, beans","The ""special""","a\nb"',
    );
  });

  it('stops a name being run as a spreadsheet formula', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '-2', '@cmd']])).toBe(
      `"'=HYPERLINK(""x"")",'+1,'-2,'@cmd`,
    );
  });

  it('leaves numbers, including negative ones, as numbers', () => {
    expect(toCsv([[-5, 0]])).toBe('-5,0');
  });
});
