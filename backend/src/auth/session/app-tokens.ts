import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { APP_CONFIG } from '../../config/app-config.token';
import type { AppConfig } from '../../config/env.validation';

const ISSUER = 'mustard-seed-api';
/** Distinct from the web cookie's audience, so neither token works in place of the other. */
const AUDIENCE = 'mustard-seed-app';

/**
 * Tokens for the Android app (AGENT.md section 15): a short-lived access token (HS256 JWT,
 * sent as a bearer token) and an opaque refresh token, stored server-side only as a hash.
 */
@Injectable()
export class AppTokens {
  private readonly key: Uint8Array;
  private readonly accessTtlMinutes: number;

  constructor(
    @Inject(APP_CONFIG) config: Pick<AppConfig, 'JWT_SECRET' | 'APP_ACCESS_TTL_MINUTES'>,
  ) {
    this.key = new TextEncoder().encode(config.JWT_SECRET);
    this.accessTtlMinutes = config.APP_ACCESS_TTL_MINUTES;
  }

  async issueAccess(userId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + this.accessTtlMinutes * 60;
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

  /** null for anything that is not a valid, unexpired app access token of ours. */
  async verifyAccess(token: string, now = new Date()): Promise<{ userId: string } | null> {
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

  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
