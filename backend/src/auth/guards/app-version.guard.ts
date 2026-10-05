import { CanActivate, ExecutionContext, HttpException, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.token';
import type { AppConfig } from '../../config/env.validation';

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** True when version (x.y.z) is older than min (x.y.z). */
export function isOlder(version: string, min: string): boolean {
  const a = VERSION.exec(version)?.slice(1).map(Number) ?? [];
  const b = VERSION.exec(min)?.slice(1).map(Number) ?? [];
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

/**
 * Tells outdated Android apps to update (AGENT.md section 15): with APP_MIN_VERSION set, a
 * request whose X-App-Version is older (or not a version at all) gets 426. Requests without
 * the header (the website) are never affected.
 */
@Injectable()
export class AppVersionGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'APP_MIN_VERSION'>) {}

  canActivate(context: ExecutionContext): boolean {
    const min = this.config.APP_MIN_VERSION;
    const req = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const version = req.headers['x-app-version'];
    if (!min || version === undefined) return true;
    if (typeof version === 'string' && VERSION.test(version) && !isOlder(version, min)) {
      return true;
    }
    throw new HttpException(
      {
        code: 'APP_UPDATE_REQUIRED',
        message: 'Please update the app to keep ordering.',
      },
      426,
    );
  }
}
