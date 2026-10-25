import type { Role } from '@/stores/auth';

export type StaffRole = Exclude<Role, 'customer'>;

export type AdminSectionName =
  | 'admin-availability'
  | 'admin-meats'
  | 'admin-dishes'
  | 'admin-prices'
  | 'admin-photos'
  | 'admin-staff';

export interface AdminSection {
  /** Route name, also the key the router and nav share. */
  name: AdminSectionName;
  /** Path under /admin. */
  path: string;
  label: string;
  description: string;
  /** Who may use it. The backend enforces the same rule; this only decides what to show. */
  roles: readonly StaffRole[];
}

/** The staff screens, in nav order (AGENT.md §3.4, §11 slice 8). */
export const adminSections: readonly AdminSection[] = [
  {
    name: 'admin-availability',
    path: 'availability',
    label: 'Availability',
    description: 'Switch dishes and meats on or off when the kitchen runs out.',
    roles: ['supervisor', 'super_admin'],
  },
  {
    name: 'admin-meats',
    path: 'meats',
    label: 'Meats & prices',
    description: 'Add meats and set their prices, per soup where they differ.',
    roles: ['supervisor', 'super_admin'],
  },
  {
    name: 'admin-dishes',
    path: 'dishes',
    label: 'Dishes',
    description: 'Add new dishes, edit names and descriptions, reorder and retire them.',
    roles: ['super_admin'],
  },
  {
    name: 'admin-prices',
    path: 'prices',
    label: 'Item prices',
    description: 'Set the price of each dish and drink.',
    roles: ['super_admin'],
  },
  {
    name: 'admin-photos',
    path: 'photos',
    label: 'Photos',
    description: 'Upload and replace dish photos.',
    roles: ['super_admin'],
  },
  {
    name: 'admin-staff',
    path: 'staff',
    label: 'Staff',
    description: 'Add supervisors and super admins, change roles, and remove access.',
    roles: ['super_admin'],
  },
];

const STAFF_ROLES: readonly Role[] = ['supervisor', 'super_admin'];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export function canUse(role: Role, roles: readonly StaffRole[]): boolean {
  return (roles as readonly Role[]).includes(role);
}

export function sectionsFor(role: Role): AdminSection[] {
  return adminSections.filter((s) => canUse(role, s.roles));
}

const ROLE_LABELS: Record<Role, string> = {
  customer: 'Customer',
  supervisor: 'Kitchen supervisor',
  super_admin: 'Super admin',
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}
