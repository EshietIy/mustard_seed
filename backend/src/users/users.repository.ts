import type { GoogleIdentity } from '../auth/google/google-id-token.verifier';
import type { UserRecord } from './users.types';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepository {
  /** Creates the user on first sign-in, otherwise refreshes their profile. Matched by Google sub. */
  upsertFromGoogle(
    identity: GoogleIdentity,
    now: Date,
  ): Promise<{ user: UserRecord; created: boolean }>;
  findById(id: string): Promise<UserRecord | null>;
}
