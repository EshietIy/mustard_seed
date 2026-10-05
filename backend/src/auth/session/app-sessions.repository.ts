export const APP_SESSIONS_REPOSITORY = Symbol('APP_SESSIONS_REPOSITORY');

export type RotateOutcome = 'rotated' | 'reused' | 'expired' | 'revoked' | 'unknown';

/** Hashed refresh tokens for the Android app, grouped into families (one per sign-in). */
export interface AppSessionsRepository {
  create(input: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  /** Swaps a refresh token for a new one; a reused token revokes its whole family. Atomic. */
  rotate(
    tokenHash: string,
    newTokenHash: string,
    newExpiresAt: Date,
    now: Date,
  ): Promise<{ outcome: RotateOutcome; userId: string | null }>;
  /** Revokes every token in the family of this one. Idempotent; unknown tokens are ignored. */
  revokeFamily(tokenHash: string, now: Date): Promise<void>;
}
