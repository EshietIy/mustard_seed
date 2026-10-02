import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { SESSION_COOKIE } from './session/cookies';

const user: AuthenticatedUser = {
  id: 'u-1',
  email: 'ekaette@example.com',
  firstName: 'Ekaette',
  fullName: 'Ekaette Bassey',
  avatarUrl: null,
  role: 'customer',
};

function deps() {
  const expiresAt = new Date('2026-10-10T00:00:00Z');
  const auth = {
    signInWithGoogle: jest
      .fn()
      .mockResolvedValue({ user, session: { token: 'tok', expiresAt }, isNewUser: true }),
  } as unknown as AuthService;
  const log = { info: jest.fn() };
  const req = { log, user } as unknown as Request;
  const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
  return { controller: new AuthController(auth), auth, log, req, res, expiresAt };
}

describe('AuthController', () => {
  it('signs in: sets the session cookie, returns the user and logs without the full email', async () => {
    const { controller, req, res, log, expiresAt } = deps();
    await expect(controller.google({ credential: 'cred' }, req, res)).resolves.toEqual({ user });
    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'tok',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        expires: expiresAt,
      }),
    );
    const [fields] = log.info.mock.calls[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({
      event: 'auth.sign_in',
      outcome: 'SUCCESS',
      userId: 'u-1',
      role: 'customer',
      emailDomain: 'example.com',
      isNewUser: true,
    });
    expect(JSON.stringify(fields)).not.toContain('ekaette@');
  });

  it('returns the current user', () => {
    const { controller, req } = deps();
    expect(controller.me(req)).toEqual({ user });
  });

  it('signs out by clearing the cookie', () => {
    const { controller, req, res, log } = deps();
    controller.logout(req, res);
    expect(res.clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      expect.objectContaining({ httpOnly: true, secure: true, path: '/' }),
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.sign_out', userId: 'u-1' }),
      expect.any(String),
    );
  });
});
