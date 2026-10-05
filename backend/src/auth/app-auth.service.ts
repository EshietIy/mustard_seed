import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import {
  APP_SESSIONS_REPOSITORY,
  type AppSessionsRepository,
} from './session/app-sessions.repository';
import { AppTokens } from './session/app-tokens';

export interface AppSession {
  user: AuthenticatedUser;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const expired = () =>
  new UnauthorizedException({
    code: 'SESSION_EXPIRED',
    message: 'Your session has expired. Please sign in again.',
  });

/**
 * Sign-in for the Android app (AGENT.md section 15): Google ID token in, bearer tokens out.
 * Users, roles and staff rules are exactly the website's (AuthService.identify).
 */
@Injectable()
export class AppAuthService {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: AppTokens,
    @Inject(APP_SESSIONS_REPOSITORY) private readonly sessions: AppSessionsRepository,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'APP_REFRESH_TTL_DAYS'>,
  ) {}

  async signIn(idToken: string, now = new Date()): Promise<AppSession & { isNewUser: boolean }> {
    const { user, isNewUser } = await this.auth.identify(idToken, now);
    const refresh = this.tokens.newRefreshToken();
    const refreshTokenExpiresAt = this.refreshExpiry(now);
    await this.sessions.create({
      userId: user.id,
      familyId: randomUUID(),
      tokenHash: refresh.hash,
      expiresAt: refreshTokenExpiresAt,
    });
    const access = await this.tokens.issueAccess(user.id, now);
    return {
      user,
      isNewUser,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt,
    };
  }

  /** Swaps a refresh token for new tokens. A token used twice signs the session out. */
  async refresh(refreshToken: string, now = new Date()): Promise<AppSession> {
    const next = this.tokens.newRefreshToken();
    const refreshTokenExpiresAt = this.refreshExpiry(now);
    const { outcome, userId } = await this.sessions.rotate(
      this.tokens.hash(refreshToken),
      next.hash,
      refreshTokenExpiresAt,
      now,
    );
    if (outcome === 'reused') {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'For your security you have been signed out. Please sign in again.',
      });
    }
    if (outcome !== 'rotated' || !userId) throw expired();
    const user = await this.auth.userById(userId);
    if (!user) throw expired();
    const access = await this.tokens.issueAccess(user.id, now);
    return {
      user,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: next.token,
      refreshTokenExpiresAt,
    };
  }

  async signOut(refreshToken: string, now = new Date()): Promise<void> {
    await this.sessions.revokeFamily(this.tokens.hash(refreshToken), now);
  }

  /** The user behind a bearer access token, with their current role; null if invalid. */
  async resolveAccessToken(token: string, now = new Date()): Promise<AuthenticatedUser | null> {
    const claims = await this.tokens.verifyAccess(token, now);
    return claims ? this.auth.userById(claims.userId) : null;
  }

  private refreshExpiry(now: Date): Date {
    return new Date(now.getTime() + this.config.APP_REFRESH_TTL_DAYS * 24 * 3_600_000);
  }
}
