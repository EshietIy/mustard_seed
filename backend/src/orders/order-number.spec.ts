import { formatOrderNumber } from './order-number';

describe('formatOrderNumber', () => {
  it.each([
    [1, '#MS-0001'],
    [42, '#MS-0042'],
    [9999, '#MS-9999'],
    [10000, '#MS-10000'],
    [1234567, '#MS-1234567'],
  ])('formats %i as %s', (n, expected) => {
    expect(formatOrderNumber(n)).toBe(expected);
  });
});
