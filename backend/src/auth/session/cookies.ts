import type { CookieOptions } from 'express';

/**
 * `__Host-` prefix: the browser only accepts it when Secure, Path=/ and without Domain, so the
 * cookie can't be set or overridden by a sibling subdomain.
 */
export const SESSION_COOKIE = '__Host-ms_session';

export function sessionCookieOptions(expires: Date): CookieOptions {
  return { httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires };
}

/** Minimal Cookie header parser (we only ever need one cookie). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
