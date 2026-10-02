import type { AuthenticatedUser } from './auth.types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express augmentation
  namespace Express {
    interface Request {
      /** Set by AuthGuard when the request carries a valid session. */
      user?: AuthenticatedUser;
    }
  }
}

export {};
