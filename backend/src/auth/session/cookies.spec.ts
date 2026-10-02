import { readCookie, SESSION_COOKIE, sessionCookieOptions } from './cookies';

describe('readCookie', () => {
  it('reads a named cookie from the header', () => {
    expect(readCookie(`a=1; ${SESSION_COOKIE}=tok.en.value; b=2`, SESSION_COOKIE)).toBe(
      'tok.en.value',
    );
  });

  it('returns undefined when absent or the header is missing', () => {
    expect(readCookie('a=1', SESSION_COOKIE)).toBeUndefined();
    expect(readCookie(undefined, SESSION_COOKIE)).toBeUndefined();
  });

  it('does not match a cookie whose name merely ends with the name', () => {
    expect(readCookie(`evil${SESSION_COOKIE}=x`, SESSION_COOKIE)).toBeUndefined();
  });
});

describe('sessionCookieOptions', () => {
  it('is HttpOnly, Secure, SameSite=Lax, host-only on /', () => {
    const expires = new Date('2026-10-10T00:00:00Z');
    expect(SESSION_COOKIE.startsWith('__Host-')).toBe(true);
    expect(sessionCookieOptions(expires)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires,
    });
  });
});
