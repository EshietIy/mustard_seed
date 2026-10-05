import { HttpException, UnauthorizedException } from '@nestjs/common';
import { InMemoryStaffRepository } from '../staff/in-memory-staff.repository';
import { InMemoryUsersRepository } from '../users/in-memory-users.repository';
import { AppAuthService } from './app-auth.service';
import { AuthService } from './auth.service';
import type { GoogleIdentity, GoogleIdTokenVerifier } from './google/google-id-token.verifier';
import { AppTokens } from './session/app-tokens';
import { InMemoryAppSessionsRepository } from './session/in-memory-app-sessions.repository';
import { SessionTokens } from './session/session-tokens';

const identity: GoogleIdentity = {
  sub: 'g-1',
  email: 'ekaette@example.com',
  emailVerified: true,
  firstName: 'Ekaette',
  fullName: 'Ekaette Bassey',
  avatarUrl: null,
};
const config = {
  JWT_SECRET: 's'.repeat(40),
  APP_ACCESS_TTL_MINUTES: 15,
  APP_REFRESH_TTL_DAYS: 30,
};
const t0 = new Date('2026-10-05T12:00:00Z');
const later = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

function setup(id: GoogleIdentity = identity) {
  const verifier: GoogleIdTokenVerifier = { verify: jest.fn().mockResolvedValue(id) };
  const users = new InMemoryUsersRepository();
  const staff = new InMemoryStaffRepository();
  const auth = new AuthService(verifier, users, staff, new SessionTokens(config), {
    SESSION_TTL_HOURS_CUSTOMER: 168,
    SESSION_TTL_HOURS_STAFF: 12,
  });
  const sessions = new InMemoryAppSessionsRepository();
  const app = new AppAuthService(auth, new AppTokens(config), sessions, config);
  return { app, sessions, staff, users };
}

const codeOf = (err: unknown) => ((err as HttpException).getResponse() as { code: string }).code;

describe('AppAuthService', () => {
  it('signs in with a Google ID token and returns an access token and a refresh token', async () => {
    const { app, sessions } = setup();
    const result = await app.signIn('google-id-token', t0);
    expect(result.user).toMatchObject({ email: 'ekaette@example.com', role: 'customer' });
    expect(result.isNewUser).toBe(true);
    expect(result.accessTokenExpiresAt.toISOString()).toBe('2026-10-05T12:15:00.000Z');
    expect(result.refreshTokenExpiresAt.toISOString()).toBe('2026-11-04T12:00:00.000Z');
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0].tokenHash).not.toBe(result.refreshToken);
    await expect(app.resolveAccessToken(result.accessToken, t0)).resolves.toMatchObject({
      email: 'ekaette@example.com',
    });
  });

  it('gives provisioned staff their role, the same as on the website', async () => {
    const { app, staff } = setup();
    await staff.create({ email: 'ekaette@example.com', role: 'supervisor', createdBy: null });
    expect((await app.signIn('tok', t0)).user.role).toBe('supervisor');
  });

  it('refuses an unverified Google email', async () => {
    const { app } = setup({ ...identity, emailVerified: false });
    await expect(app.signIn('tok', t0)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates the refresh token: the new one works, the old one is spent', async () => {
    const { app } = setup();
    const first = await app.signIn('tok', t0);
    const second = await app.refresh(first.refreshToken, later(20));
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessTokenExpiresAt.toISOString()).toBe('2026-10-05T12:35:00.000Z');
    await expect(app.resolveAccessToken(second.accessToken, later(20))).resolves.not.toBeNull();
    await expect(app.refresh(second.refreshToken, later(40))).resolves.toBeDefined();
  });

  it('treats a reused refresh token as theft and signs the whole session out', async () => {
    const { app } = setup();
    const first = await app.signIn('tok', t0);
    const second = await app.refresh(first.refreshToken, later(1));
    const err = await app.refresh(first.refreshToken, later(2)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(codeOf(err)).toBe('SESSION_REVOKED');
    // The legitimate holder's newer token no longer works either.
    expect(codeOf(await app.refresh(second.refreshToken, later(3)).catch((e: unknown) => e))).toBe(
      'SESSION_EXPIRED',
    );
  });

  it('refuses unknown and expired refresh tokens', async () => {
    const { app } = setup();
    expect(codeOf(await app.refresh('nope', t0).catch((e: unknown) => e))).toBe('SESSION_EXPIRED');
    const first = await app.signIn('tok', t0);
    const thirtyOneDays = later(31 * 24 * 60);
    expect(
      codeOf(await app.refresh(first.refreshToken, thirtyOneDays).catch((e: unknown) => e)),
    ).toBe('SESSION_EXPIRED');
  });

  it('signs out by revoking the session; signing out twice is fine', async () => {
    const { app } = setup();
    const first = await app.signIn('tok', t0);
    await app.signOut(first.refreshToken, later(1));
    await app.signOut(first.refreshToken, later(2));
    await app.signOut('never-issued', later(3));
    expect(codeOf(await app.refresh(first.refreshToken, later(4)).catch((e: unknown) => e))).toBe(
      'SESSION_EXPIRED',
    );
  });

  it('ignores access tokens that are expired or not ours', async () => {
    const { app } = setup();
    const { accessToken } = await app.signIn('tok', t0);
    await expect(app.resolveAccessToken(accessToken, later(16))).resolves.toBeNull();
    await expect(app.resolveAccessToken('garbage', t0)).resolves.toBeNull();
  });

  it("uses the user's current role on every request", async () => {
    const { app, staff } = setup();
    const { accessToken } = await app.signIn('tok', t0);
    await staff.create({ email: 'ekaette@example.com', role: 'super_admin', createdBy: null });
    expect((await app.resolveAccessToken(accessToken, t0))?.role).toBe('super_admin');
  });
});
