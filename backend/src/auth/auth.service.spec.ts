import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { GoogleIdentity, GoogleIdTokenVerifier } from './google/google-id-token.verifier';
import { SessionTokens } from './session/session-tokens';
import { InMemoryStaffRepository } from '../staff/in-memory-staff.repository';
import { InMemoryUsersRepository } from '../users/in-memory-users.repository';

const identity: GoogleIdentity = {
  sub: 'g-1',
  email: 'ekaette@example.com',
  emailVerified: true,
  firstName: 'Ekaette',
  fullName: 'Ekaette Bassey',
  avatarUrl: null,
};

function setup(id: GoogleIdentity = identity) {
  const verifier: GoogleIdTokenVerifier = { verify: jest.fn().mockResolvedValue(id) };
  const users = new InMemoryUsersRepository();
  const staff = new InMemoryStaffRepository();
  const tokens = new SessionTokens({ JWT_SECRET: 's'.repeat(40) });
  const service = new AuthService(verifier, users, staff, tokens, {
    SESSION_TTL_HOURS_CUSTOMER: 168,
    SESSION_TTL_HOURS_STAFF: 12,
  });
  return { service, users, staff, tokens, verifier };
}

describe('AuthService.signInWithGoogle', () => {
  it('creates a customer on first sign-in and issues a 7-day session', async () => {
    const { service, users } = setup();
    const now = new Date('2026-10-03T10:00:00Z');
    const result = await service.signInWithGoogle('cred', now);
    expect(result.user).toMatchObject({
      email: 'ekaette@example.com',
      firstName: 'Ekaette',
      role: 'customer',
    });
    expect(result.isNewUser).toBe(true);
    expect(result.session.expiresAt.toISOString()).toBe('2026-10-10T10:00:00.000Z');
    expect(users.all()).toHaveLength(1);
  });

  it('updates the same user on later sign-ins (matched by Google sub)', async () => {
    const { service, users } = setup();
    await service.signInWithGoogle('cred');
    const again = await service.signInWithGoogle('cred');
    expect(again.isNewUser).toBe(false);
    expect(users.all()).toHaveLength(1);
  });

  it('gives an active provisioned staff member their staff role and a 12-hour session', async () => {
    const { service, staff } = setup();
    await staff.create({ email: 'ekaette@example.com', role: 'supervisor', createdBy: null });
    const now = new Date('2026-10-03T10:00:00Z');
    const result = await service.signInWithGoogle('cred', now);
    expect(result.user.role).toBe('supervisor');
    expect(result.session.expiresAt.toISOString()).toBe('2026-10-03T22:00:00.000Z');
  });

  it('treats a deactivated staff member as a customer', async () => {
    const { service, staff } = setup();
    const member = await staff.create({
      email: 'ekaette@example.com',
      role: 'super_admin',
      createdBy: null,
    });
    await staff.update(member.id, { isActive: false });
    expect((await service.signInWithGoogle('cred')).user.role).toBe('customer');
  });

  it('refuses an unverified Google email', async () => {
    const { service, users } = setup({ ...identity, emailVerified: false });
    const err = await service.signInWithGoogle('cred').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).getResponse()).toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
    expect(users.all()).toHaveLength(0);
  });

  it('propagates verifier failures without creating a user', async () => {
    const { service, users, verifier } = setup();
    (verifier.verify as jest.Mock).mockRejectedValue(new UnauthorizedException());
    await expect(service.signInWithGoogle('cred')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.all()).toHaveLength(0);
  });
});

describe('AuthService.resolveSession', () => {
  it('returns the current user with their live role', async () => {
    const { service, staff } = setup();
    const { session } = await service.signInWithGoogle('cred');
    expect((await service.resolveSession(session.token))?.role).toBe('customer');
    await staff.create({ email: 'ekaette@example.com', role: 'super_admin', createdBy: null });
    expect((await service.resolveSession(session.token))?.role).toBe('super_admin');
  });

  it('returns null for a missing, invalid or orphaned session', async () => {
    const { service, tokens } = setup();
    await expect(service.resolveSession(undefined)).resolves.toBeNull();
    await expect(service.resolveSession('nonsense')).resolves.toBeNull();
    const { token } = await tokens.issue('no-such-user', 1);
    await expect(service.resolveSession(token)).resolves.toBeNull();
  });
});
