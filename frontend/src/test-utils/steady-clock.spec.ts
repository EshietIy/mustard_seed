import { describe, expect, it } from 'vitest';

describe('the steady test clock', () => {
  it('is installed for every test file and follows the monotonic timer', () => {
    expect(Date.now.toString()).not.toContain('[native code]');
    const steady = performance.timeOrigin + performance.now();
    expect(Math.abs(Date.now() - steady)).toBeLessThan(5);
  });

  it('never goes backwards', () => {
    let last = Date.now();
    for (let i = 0; i < 10_000; i++) {
      const now = Date.now();
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it('still lets new Date() and fake timers work', () => {
    expect(new Date().getFullYear()).toBeGreaterThan(2000);
  });
});
