import { randomUUID } from 'node:crypto';
import type { StaffRole } from '../auth/auth.types';
import { StaffAlreadyExistsError, type StaffRepository } from './staff.repository';
import type { StaffRecord } from './staff.types';

/** In-memory StaffRepository for unit tests. */
export class InMemoryStaffRepository implements StaffRepository {
  private readonly rows = new Map<string, StaffRecord>();

  findActiveByEmail(email: string): Promise<StaffRecord | null> {
    return Promise.resolve(
      [...this.rows.values()].find((s) => s.email === email && s.isActive) ?? null,
    );
  }

  findById(id: string): Promise<StaffRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  list(): Promise<StaffRecord[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  create(input: {
    email: string;
    role: StaffRole;
    createdBy: string | null;
  }): Promise<StaffRecord> {
    if ([...this.rows.values()].some((s) => s.email === input.email)) {
      return Promise.reject(new StaffAlreadyExistsError(input.email));
    }
    const row: StaffRecord = {
      id: randomUUID(),
      ...input,
      isActive: true,
      createdAt: new Date().toISOString(),
      deactivatedAt: null,
    };
    this.rows.set(row.id, row);
    return Promise.resolve(row);
  }

  update(id: string, patch: { role?: StaffRole; isActive?: boolean }): Promise<StaffRecord | null> {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve(null);
    const isActive = patch.isActive ?? row.isActive;
    const updated: StaffRecord = {
      ...row,
      role: patch.role ?? row.role,
      isActive,
      deactivatedAt: isActive ? null : (row.deactivatedAt ?? new Date().toISOString()),
    };
    this.rows.set(id, updated);
    return Promise.resolve(updated);
  }

  countActiveSuperAdmins(): Promise<number> {
    return Promise.resolve(
      [...this.rows.values()].filter((s) => s.isActive && s.role === 'super_admin').length,
    );
  }

  async upsertSuperAdmin(email: string): Promise<{ staff: StaffRecord; created: boolean }> {
    const existing = [...this.rows.values()].find((s) => s.email === email);
    if (!existing) {
      return {
        staff: await this.create({ email, role: 'super_admin', createdBy: null }),
        created: true,
      };
    }
    const staff = (await this.update(existing.id, {
      role: 'super_admin',
      isActive: true,
    })) as StaffRecord;
    return { staff, created: false };
  }
}
