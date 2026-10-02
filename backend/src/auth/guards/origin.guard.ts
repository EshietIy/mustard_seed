import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.token';
import type { AppConfig } from '../../config/env.validation';
import { readCookie, SESSION_COOKIE } from '../session/cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SIGN_IN_PATH = '/api/v1/auth/google';

interface OriginRequest {
  method: string;
  originalUrl: string;
  headers: { cookie?: string; origin?: string };
}

/**
 * CSRF defence (AGENT.md §3.3): a state-changing request carrying the session cookie must come
 * from an allowed Origin. Sign-in is always checked too, to prevent login CSRF.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(@Inject(APP_CONFIG) config: Pick<AppConfig, 'CORS_ALLOWED_ORIGINS'>) {
    this.allowed = new Set(config.CORS_ALLOWED_ORIGINS);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<OriginRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    const hasSession = readCookie(req.headers.cookie, SESSION_COOKIE) !== undefined;
    const isSignIn = req.originalUrl.split('?')[0] === SIGN_IN_PATH;
    if (!hasSession && !isSignIn) return true;
    if (req.headers.origin && this.allowed.has(req.headers.origin)) return true;
    throw new ForbiddenException({
      code: 'ORIGIN_REJECTED',
      message: 'This request was blocked for your security. Please reload the page and try again.',
    });
  }
}
