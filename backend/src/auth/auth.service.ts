import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { STAFF_REPOSITORY, type StaffRepository } from '../staff/staff.repository';
import { USERS_REPOSITORY, type UsersRepository } from '../users/users.repository';
import type { UserRecord } from '../users/users.types';
import type { AuthenticatedUser, Role } from './auth.types';
import {
  GOOGLE_ID_TOKEN_VERIFIER,
  type GoogleIdTokenVerifier,
} from './google/google-id-token.verifier';
import { SessionTokens } from './session/session-tokens';

export interface SignInResult {
  user: AuthenticatedUser;
  session: { token: string; expiresAt: Date };
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(GOOGLE_ID_TOKEN_VERIFIER) private readonly google: GoogleIdTokenVerifier,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(STAFF_REPOSITORY) private readonly staff: StaffRepository,
    private readonly tokens: SessionTokens,
    @Inject(APP_CONFIG)
    private readonly config: Pick<
      AppConfig,
      'SESSION_TTL_HOURS_CUSTOMER' | 'SESSION_TTL_HOURS_STAFF'
    >,
  ) {}

  async signInWithGoogle(credential: string, now = new Date()): Promise<SignInResult> {
    const identity = await this.google.verify(credential);
    if (!identity.emailVerified) {
      // Staff matching relies on the email, so an unverified one is never accepted.
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Your Google email address isn’t verified. Verify it with Google and try again.',
      });
    }
    const { user: record, created } = await this.users.upsertFromGoogle(identity, now);
    const user = await this.withRole(record);
    const ttl =
      user.role === 'customer'
        ? this.config.SESSION_TTL_HOURS_CUSTOMER
        : this.config.SESSION_TTL_HOURS_STAFF;
    const session = await this.tokens.issue(user.id, ttl, now);
    return { user, session, isNewUser: created };
  }

  /** The user behind a session cookie, with their current role; null if not signed in. */
  async resolveSession(token: string | undefined): Promise<AuthenticatedUser | null> {
    if (!token) return null;
    const claims = await this.tokens.verify(token);
    if (!claims) return null;
    const record = await this.users.findById(claims.userId);
    return record ? this.withRole(record) : null;
  }

  /** Staff role only for an ACTIVE provisioned record matching the verified email. */
  private async withRole(record: UserRecord): Promise<AuthenticatedUser> {
    const staff = await this.staff.findActiveByEmail(record.email);
    const role: Role = staff ? staff.role : 'customer';
    return {
      id: record.id,
      email: record.email,
      firstName: record.firstName,
      fullName: record.fullName,
      avatarUrl: record.avatarUrl,
      role,
    };
  }
}
