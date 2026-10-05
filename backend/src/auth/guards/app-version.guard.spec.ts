import { ExecutionContext, HttpException } from '@nestjs/common';
import { AppVersionGuard, isOlder } from './app-version.guard';

function ctx(version?: string) {
  const req = { headers: version === undefined ? {} : { 'x-app-version': version } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('isOlder', () => {
  it.each([
    ['1.2.2', '1.2.3', true],
    ['1.2.3', '1.2.3', false],
    ['1.10.0', '1.9.9', false],
    ['0.9.9', '1.0.0', true],
    ['2.0.0', '1.99.99', false],
  ])('%s older than %s: %s', (version, min, expected) => {
    expect(isOlder(version, min)).toBe(expected);
  });
});

describe('AppVersionGuard', () => {
  const guard = (min?: string) => new AppVersionGuard({ APP_MIN_VERSION: min });

  it('lets everything through when no minimum is set', () => {
    expect(guard().canActivate(ctx('0.0.1'))).toBe(true);
  });

  it('never affects requests without the header (the website)', () => {
    expect(guard('2.0.0').canActivate(ctx())).toBe(true);
  });

  it('lets current apps through', () => {
    expect(guard('1.2.0').canActivate(ctx('1.2.0'))).toBe(true);
    expect(guard('1.2.0').canActivate(ctx('1.3.0'))).toBe(true);
  });

  it('tells outdated or unrecognisable apps to update (426)', () => {
    for (const version of ['1.1.9', 'banana', '1.2']) {
      const err = (() => {
        try {
          guard('1.2.0').canActivate(ctx(version));
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(426);
      expect((err as HttpException).getResponse()).toMatchObject({ code: 'APP_UPDATE_REQUIRED' });
    }
  });
});
