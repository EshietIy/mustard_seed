import type { Request } from 'express';
import { AppAuthController } from './app-auth.controller';
import type { AppAuthService } from './app-auth.service';

const user = { id: 'u-1', email: 'ekaette@example.com', role: 'customer' };
const session = {
  user,
  accessToken: 'access',
  accessTokenExpiresAt: new Date('2026-10-05T12:15:00Z'),
  refreshToken: 'refresh',
  refreshTokenExpiresAt: new Date('2026-11-04T12:00:00Z'),
};

function deps() {
  const service = {
    signIn: jest.fn().mockResolvedValue({ ...session, isNewUser: true }),
    refresh: jest.fn().mockResolvedValue(session),
    signOut: jest.fn().mockResolvedValue(undefined),
  } as unknown as AppAuthService;
  const log = { info: jest.fn(), warn: jest.fn() };
  const req = { log } as unknown as Request;
  return { controller: new AppAuthController(service), service, log, req };
}

describe('AppAuthController', () => {
  it('signs in and logs it without any token', async () => {
    const { controller, log, req } = deps();
    const result = await controller.google({ idToken: 'google-id-token' }, req);
    expect(result).toEqual({
      user,
      accessToken: 'access',
      accessTokenExpiresAt: '2026-10-05T12:15:00.000Z',
      refreshToken: 'refresh',
      refreshTokenExpiresAt: '2026-11-04T12:00:00.000Z',
    });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.app_sign_in',
        outcome: 'SUCCESS',
        userId: 'u-1',
        emailDomain: 'example.com',
        isNewUser: true,
      }),
      expect.any(String),
    );
    expect(JSON.stringify(log.info.mock.calls)).not.toMatch(/access|refresh|google-id-token/);
  });

  it('refreshes and signs out', async () => {
    const { controller, service, req } = deps();
    await expect(controller.refresh({ refreshToken: 'refresh' }, req)).resolves.toMatchObject({
      accessToken: 'access',
    });
    await controller.logout({ refreshToken: 'refresh' }, req);
    expect(service.signOut).toHaveBeenCalledWith('refresh');
  });
});
