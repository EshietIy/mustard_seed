export const GOOGLE_ID_TOKEN_VERIFIER = Symbol('GOOGLE_ID_TOKEN_VERIFIER');

export interface GoogleIdentity {
  /** Google's stable account id. */
  sub: string;
  /** Lower-cased. */
  email: string;
  emailVerified: boolean;
  firstName: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface GoogleIdTokenVerifier {
  /**
   * Verifies a Google ID token (signature, issuer, audience, expiry).
   * Throws 401 for an invalid token and 503 when Google's keys can't be fetched.
   */
  verify(credential: string): Promise<GoogleIdentity>;
}
