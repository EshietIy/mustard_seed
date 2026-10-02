import { SetMetadata } from '@nestjs/common';
import type { Role } from '../auth.types';

export const ROLES_KEY = 'auth:roles';

/** Restricts a route to the given roles (checked on the server for every request). */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
