import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const STRICT_THROTTLE_KEY = 'throttle:strict';

/** Apply the stricter rate limit (sign-in, order creation, payment init, uploads). */
export const StrictThrottle = (): MethodDecorator & ClassDecorator =>
  SetMetadata(STRICT_THROTTLE_KEY, true);

const reflector = new Reflector();

export function resolveLimit(limits: {
  THROTTLE_LIMIT: number;
  THROTTLE_STRICT_LIMIT: number;
}): (context: ExecutionContext) => number {
  return (context) =>
    reflector.getAllAndOverride<boolean>(STRICT_THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
      ? limits.THROTTLE_STRICT_LIMIT
      : limits.THROTTLE_LIMIT;
}
