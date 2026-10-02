import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import type { AuthenticatedUser, Role } from '../auth.types';
import { readCookie, SESSION_COOKIE } from '../session/cookies';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

interface AuthRequest {
  headers: { cookie?: string };
  user?: AuthenticatedUser;
}

/**
 * Global guard, deny by default (AGENT.md §3.4): every route needs a valid session unless it
 * is marked @Public(), and @Roles() is enforced against the user's live role.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    const req = context.switchToHttp().getRequest<AuthRequest>();

    const user = await this.auth.resolveSession(readCookie(req.headers.cookie, SESSION_COOKIE));
    if (user) req.user = user;
    if (isPublic) return true;
    if (!user) throw new UnauthorizedException();

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}
