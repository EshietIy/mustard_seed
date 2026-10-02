import { isOrderingOpen, localTime } from './hours';

describe('localTime', () => {
  it('converts UTC to West Africa Time (UTC+1, no daylight saving)', () => {
    expect(localTime(new Date('2026-10-04T21:29:00Z'), 'Africa/Lagos')).toBe('22:29');
    expect(localTime(new Date('2026-10-04T23:30:00Z'), 'Africa/Lagos')).toBe('00:30');
    expect(localTime(new Date('2026-01-15T06:59:00Z'), 'Africa/Lagos')).toBe('07:59');
  });
});

describe('isOrderingOpen', () => {
  const hours = { opensAt: '08:00', onlineOrdersCloseAt: '22:30', timezone: 'Africa/Lagos' };
  const at = (wat: string) => new Date(`2026-10-04T${wat}:00+01:00`);

  it.each([
    ['07:59', false],
    ['08:00', true],
    ['12:00', true],
    ['22:29', true],
    ['22:30', false],
    ['23:15', false],
    ['00:30', false],
  ])('at %s WAT open=%s', (time, open) => {
    expect(isOrderingOpen(hours, at(time))).toBe(open);
  });
});
