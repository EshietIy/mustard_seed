import { formatNaira } from './money';

describe('formatNaira', () => {
  it.each([
    [150000, '₦1,500'],
    [1250000, '₦12,500'],
    [12345, '₦123.45'],
    [0, '₦0'],
  ])('%i kobo → %s', (kobo, expected) => {
    expect(formatNaira(kobo)).toBe(expected);
  });
});
