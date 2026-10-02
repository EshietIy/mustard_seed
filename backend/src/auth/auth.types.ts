// Adds `user` to Express's Request type (set by AuthGuard).
import './request-user';

export const STAFF_ROLES = ['supervisor', 'super_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type Role = 'customer' | StaffRole;

/** The signed-in user as seen by guards and controllers. Role is resolved live, never trusted from the client. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  fullName: string;
  avatarUrl: string | null;
  role: Role;
}

/** "ada@example.com" → "example.com". Full addresses are never logged (AGENT.md §6). */
export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}
