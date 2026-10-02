import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { UpstreamUnavailableException } from '../../common/errors/upstream-unavailable.exception';
import { APP_CONFIG } from '../../config/app-config.token';
import type { AppConfig } from '../../config/env.validation';
import type { GoogleIdentity, GoogleIdTokenVerifier } from './google-id-token.verifier';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export const invalidGoogleToken = (): UnauthorizedException =>
  new UnauthorizedException({
    code: 'INVALID_GOOGLE_TOKEN',
    message: 'We couldn’t verify your Google sign-in. Please try again.',
  });

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

@Injectable()
export class JoseGoogleIdTokenVerifier implements GoogleIdTokenVerifier {
  private readonly keys: JWTVerifyGetKey;

  constructor(
    @Inject(APP_CONFIG)
    private readonly config: Pick<AppConfig, 'GOOGLE_CLIENT_ID' | 'GOOGLE_JWKS_URL'>,
    keys?: JWTVerifyGetKey,
  ) {
    // Keys are cached and refreshed by jose; a slow key server fails fast.
    this.keys =
      keys ?? createRemoteJWKSet(new URL(config.GOOGLE_JWKS_URL), { timeoutDuration: 5000 });
  }

  async verify(credential: string): Promise<GoogleIdentity> {
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(credential, this.keys, {
        algorithms: ['RS256'],
        issuer: GOOGLE_ISSUERS,
        audience: this.config.GOOGLE_CLIENT_ID,
      }));
    } catch (err) {
      if (err instanceof errors.JOSEError && !(err instanceof errors.JWKSTimeout)) {
        throw invalidGoogleToken();
      }
      // Network failure or timeout fetching Google's keys.
      throw new UpstreamUnavailableException(
        'google',
        'jwks.fetch',
        err instanceof Error ? err.message : String(err),
      );
    }

    const email = str(payload.email).trim().toLowerCase();
    if (!payload.sub || !email) throw invalidGoogleToken();
    const picture = str(payload.picture);
    return {
      sub: payload.sub as string,
      email,
      emailVerified: payload.email_verified === true,
      firstName: str(payload.given_name).slice(0, 100),
      fullName: str(payload.name).slice(0, 200),
      avatarUrl: picture.startsWith('https://') ? picture : null,
    };
  }
}
