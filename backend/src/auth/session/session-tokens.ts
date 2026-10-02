import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { APP_CONFIG } from '../../config/app-config.token';
import type { AppConfig } from '../../config/env.validation';

const ISSUER = 'mustard-seed-api';
const AUDIENCE = 'mustard-seed-web';

/** Our own session tokens (HS256), carried only in the HttpOnly session cookie. */
@Injectable()
export class SessionTokens {
  private readonly key: Uint8Array;

  constructor(@Inject(APP_CONFIG) config: Pick<AppConfig, 'JWT_SECRET'>) {
    this.key = new TextEncoder().encode(config.JWT_SECRET);
  }

  async issue(
    userId: string,
    ttlHours: number,
    now = new Date(),
  ): Promise<{ token: string; expiresAt: Date }> {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + ttlHours * 3600;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.key);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /** Returns null for anything that is not a valid, unexpired session token of ours. */
  async verify(token: string, now = new Date()): Promise<{ userId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: now,
      });
      return payload.sub ? { userId: payload.sub } : null;
    } catch {
      return null;
    }
  }
}
