import { ExecutionContext } from '@nestjs/common';
import { StrictThrottle, resolveLimit } from './throttling';

class Ctrl {
  @StrictThrottle()
  strict() {}
  normal() {}
}

function ctx(handler: () => void): ExecutionContext {
  return { getHandler: () => handler, getClass: () => Ctrl } as unknown as ExecutionContext;
}

describe('resolveLimit', () => {
  const limits = { THROTTLE_LIMIT: 100, THROTTLE_STRICT_LIMIT: 5 };

  it('uses the default limit for normal routes', () => {
    expect(resolveLimit(limits)(ctx(Ctrl.prototype.normal))).toBe(100);
  });

  it('uses the strict limit for routes marked @StrictThrottle()', () => {
    expect(resolveLimit(limits)(ctx(Ctrl.prototype.strict))).toBe(5);
  });
});
