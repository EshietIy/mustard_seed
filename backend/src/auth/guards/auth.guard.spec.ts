import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthService } from '../auth.service';
import type { AuthenticatedUser } from '../auth.types';
import { SESSION_COOKIE } from '../session/cookies';
import { AuthGuard } from './auth.guard';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';

class Ctrl {
  @Public()
  open() {}
  anyUser() {}
  @Roles('super_admin')
  adminOnly() {}
  @Roles('supervisor', 'super_admin')
  staffOnly() {}
}

const user = (role: AuthenticatedUser['role']): AuthenticatedUser => ({
  id: 'u-1',
  email: 'a@example.com',
  firstName: 'A',
  fullName: 'A B',
  avatarUrl: null,
  role,
});

function ctx(handler: () => void, cookie?: string) {
  const req: { headers: Record<string, string>; user?: AuthenticatedUser } = {
    headers: cookie ? { cookie } : {},
  };
  const context = {
    getHandler: () => handler,
    getClass: () => Ctrl,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

function guardResolving(u: AuthenticatedUser | null) {
  const auth = { resolveSession: jest.fn().mockResolvedValue(u) } as unknown as AuthService;
  return { guard: new AuthGuard(new Reflector(), auth), auth };
}

const withSession = `${SESSION_COOKIE}=tok`;

describe('AuthGuard', () => {
  it('lets anyone through a @Public route, attaching the user when signed in', async () => {
    const { guard } = guardResolving(user('customer'));
    const { context, req } = ctx(Ctrl.prototype.open, withSession);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user?.id).toBe('u-1');
    const anon = ctx(Ctrl.prototype.open);
    await expect(guardResolving(null).guard.canActivate(anon.context)).resolves.toBe(true);
  });

  it('denies by default: 401 without a valid session', async () => {
    const { guard } = guardResolving(null);
    await expect(guard.canActivate(ctx(Ctrl.prototype.anyUser).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      guard.canActivate(ctx(Ctrl.prototype.anyUser, withSession).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows any signed-in user on routes without @Roles', async () => {
    const { guard } = guardResolving(user('customer'));
    await expect(guard.canActivate(ctx(Ctrl.prototype.anyUser, withSession).context)).resolves.toBe(
      true,
    );
  });

  it('enforces @Roles with 403', async () => {
    await expect(
      guardResolving(user('customer')).guard.canActivate(
        ctx(Ctrl.prototype.staffOnly, withSession).context,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guardResolving(user('supervisor')).guard.canActivate(
        ctx(Ctrl.prototype.adminOnly, withSession).context,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guardResolving(user('supervisor')).guard.canActivate(
        ctx(Ctrl.prototype.staffOnly, withSession).context,
      ),
    ).resolves.toBe(true);
    await expect(
      guardResolving(user('super_admin')).guard.canActivate(
        ctx(Ctrl.prototype.adminOnly, withSession).context,
      ),
    ).resolves.toBe(true);
  });
});
