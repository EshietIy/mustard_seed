import type { StaffRole } from '../auth/auth.types';
import type { StaffRecord } from './staff.types';

export const STAFF_REPOSITORY = Symbol('STAFF_REPOSITORY');

/** Thrown by create() when the email is already provisioned. */
export class StaffAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`staff member already exists for ${email.slice(email.lastIndexOf('@'))}`);
  }
}

export interface StaffRepository {
  findActiveByEmail(email: string): Promise<StaffRecord | null>;
  findById(id: string): Promise<StaffRecord | null>;
  list(): Promise<StaffRecord[]>;
  create(input: { email: string; role: StaffRole; createdBy: string | null }): Promise<StaffRecord>;
  update(id: string, patch: { role?: StaffRole; isActive?: boolean }): Promise<StaffRecord | null>;
  countActiveSuperAdmins(): Promise<number>;
  /** Seed script: creates the super admin, or re-activates and promotes an existing record. */
  upsertSuperAdmin(email: string): Promise<{ staff: StaffRecord; created: boolean }>;
}
