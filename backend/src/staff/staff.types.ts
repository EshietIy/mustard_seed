import type { StaffRole } from '../auth/auth.types';

export interface StaffRecord {
  id: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  deactivatedAt: string | null;
}
