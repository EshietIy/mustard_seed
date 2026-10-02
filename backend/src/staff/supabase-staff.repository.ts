import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffRole } from '../auth/auth.types';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import { StaffAlreadyExistsError, type StaffRepository } from './staff.repository';
import type { StaffRecord } from './staff.types';

const COLUMNS = 'id, email, role, is_active, created_by, created_at, deactivated_at';
const UNIQUE_VIOLATION = '23505';

interface StaffRow {
  id: string;
  email: string;
  role: StaffRole;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  deactivated_at: string | null;
}

const toRecord = (r: StaffRow): StaffRecord => ({
  id: r.id,
  email: r.email,
  role: r.role,
  isActive: r.is_active,
  createdBy: r.created_by,
  createdAt: r.created_at,
  deactivatedAt: r.deactivated_at,
});

const fail = (op: string, message: string) =>
  new UpstreamUnavailableException('supabase', op, message);

@Injectable()
export class SupabaseStaffRepository implements StaffRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async findActiveByEmail(email: string): Promise<StaffRecord | null> {
    const op = 'staff.find_active_by_email';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('staff_members')
        .select(COLUMNS)
        .eq('email', email)
        .eq('is_active', true)
        .maybeSingle<StaffRow>(),
    );
    if (error) throw fail(op, error.message);
    return data ? toRecord(data) : null;
  }

  async findById(id: string): Promise<StaffRecord | null> {
    const op = 'staff.find_by_id';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db.from('staff_members').select(COLUMNS).eq('id', id).maybeSingle<StaffRow>(),
    );
    if (error) throw fail(op, error.message);
    return data ? toRecord(data) : null;
  }

  async list(): Promise<StaffRecord[]> {
    const op = 'staff.list';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db.from('staff_members').select(COLUMNS).order('created_at'),
    );
    if (error) throw fail(op, error.message);
    return ((data ?? []) as StaffRow[]).map(toRecord);
  }

  async create(input: {
    email: string;
    role: StaffRole;
    createdBy: string | null;
  }): Promise<StaffRecord> {
    const op = 'staff.create';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('staff_members')
        .insert({ email: input.email, role: input.role, created_by: input.createdBy })
        .select(COLUMNS)
        .single<StaffRow>(),
    );
    if (error?.code === UNIQUE_VIOLATION) throw new StaffAlreadyExistsError(input.email);
    if (error || !data) throw fail(op, error?.message ?? 'no row');
    return toRecord(data);
  }

  async update(
    id: string,
    patch: { role?: StaffRole; isActive?: boolean },
  ): Promise<StaffRecord | null> {
    const op = 'staff.update';
    const changes: Record<string, unknown> = {};
    if (patch.isActive !== undefined) {
      changes.is_active = patch.isActive;
      changes.deactivated_at = patch.isActive ? null : new Date().toISOString();
    }
    if (patch.role !== undefined) changes.role = patch.role;
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('staff_members')
        .update(changes)
        .eq('id', id)
        .select(COLUMNS)
        .maybeSingle<StaffRow>(),
    );
    if (error) throw fail(op, error.message);
    return data ? toRecord(data) : null;
  }

  async countActiveSuperAdmins(): Promise<number> {
    const op = 'staff.count_active_super_admins';
    const { count, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('staff_members')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'super_admin')
        .eq('is_active', true),
    );
    if (error) throw fail(op, error.message);
    return count ?? 0;
  }

  async upsertSuperAdmin(email: string): Promise<{ staff: StaffRecord; created: boolean }> {
    const op = 'staff.find_by_email';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db.from('staff_members').select('id').eq('email', email).maybeSingle<{ id: string }>(),
    );
    if (error) throw fail(op, error.message);
    if (!data) {
      return {
        staff: await this.create({ email, role: 'super_admin', createdBy: null }),
        created: true,
      };
    }
    const staff = await this.update(data.id, { role: 'super_admin', isActive: true });
    if (!staff) throw fail('staff.update', 'row disappeared');
    return { staff, created: false };
  }
}
