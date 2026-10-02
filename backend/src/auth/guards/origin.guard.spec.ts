import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SESSION_COOKIE } from '../session/cookies';
import { OriginGuard } from './origin.guard';

function ctx(method: string, headers: Record<string, string>, url = '/api/v1/admin/staff') {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers, originalUrl: url }) }),
  } as unknown as ExecutionContext;
}

const guard = new OriginGuard({ CORS_ALLOWED_ORIGINS: ['https://mustardseed.ng'] });
const cookie = `${SESSION_COOKIE}=tok`;

describe('OriginGuard (CSRF defence)', () => {
  it('ignores safe methods', () => {
    expect(guard.canActivate(ctx('GET', { cookie, origin: 'https://evil.com' }))).toBe(true);
  });

  it('ignores state-changing requests without a session cookie (no ambient authority)', () => {
    expect(guard.canActivate(ctx('POST', {}, '/api/v1/payments/webhook'))).toBe(true);
  });

  it('allows a cookie-authenticated change from an allowed origin', () => {
    expect(guard.canActivate(ctx('PATCH', { cookie, origin: 'https://mustardseed.ng' }))).toBe(
      true,
    );
  });

  it.each([
    ['a foreign origin', { cookie, origin: 'https://evil.com' }],
    ['a look-alike origin', { cookie, origin: 'https://mustardseed.ng.evil.com' }],
    ['no origin at all', { cookie }],
  ])('refuses a cookie-authenticated change from %s', (_label, headers) => {
    expect(() => guard.canActivate(ctx('POST', headers))).toThrow(ForbiddenException);
  });

  it('always checks the origin on sign-in, to stop login CSRF', () => {
    expect(() =>
      guard.canActivate(ctx('POST', { origin: 'https://evil.com' }, '/api/v1/auth/google')),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(ctx('POST', { origin: 'https://mustardseed.ng' }, '/api/v1/auth/google')),
    ).toBe(true);
  });
});
