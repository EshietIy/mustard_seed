import { normalizeNigerianPhone } from './phone';

describe('normalizeNigerianPhone', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['0803 123 4567', '+2348031234567'],
    ['0803-123-4567', '+2348031234567'],
    ['+2348031234567', '+2348031234567'],
    ['+234 803 123 4567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['+234 (0) 803 123 4567', '+2348031234567'],
    ['09012345678', '+2349012345678'],
    ['07012345678', '+2347012345678'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeNigerianPhone(input)).toBe(expected);
  });

  it.each([
    '',
    '12345',
    '0803123456',
    '080312345678',
    '+447911123456',
    '+234803123456',
    'phone',
    '08031234567x',
  ])('rejects %p', (input) => {
    expect(normalizeNigerianPhone(input)).toBeNull();
  });
});
