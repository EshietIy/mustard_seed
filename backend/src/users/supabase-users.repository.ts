import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoogleIdentity } from '../auth/google/google-id-token.verifier';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { UsersRepository } from './users.repository';
import type { UserRecord } from './users.types';

const COLUMNS = 'id, google_sub, email, first_name, full_name, avatar_url';
const UNIQUE_VIOLATION = '23505';

interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  first_name: string;
  full_name: string;
  avatar_url: string | null;
}

const toRecord = (r: UserRow): UserRecord => ({
  id: r.id,
  googleSub: r.google_sub,
  email: r.email,
  firstName: r.first_name,
  fullName: r.full_name,
  avatarUrl: r.avatar_url,
});

@Injectable()
export class SupabaseUsersRepository implements UsersRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async upsertFromGoogle(
    identity: GoogleIdentity,
    now: Date,
  ): Promise<{ user: UserRecord; created: boolean }> {
    const profile = {
      email: identity.email,
      first_name: identity.firstName,
      full_name: identity.fullName,
      avatar_url: identity.avatarUrl,
      last_sign_in_at: now.toISOString(),
    };
    const existingId = await this.findIdBySub(identity.sub);
    if (existingId) return { user: await this.updateProfile(existingId, profile), created: false };

    const op = 'users.insert';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('users')
        .insert({ google_sub: identity.sub, ...profile })
        .select(COLUMNS)
        .single<UserRow>(),
    );
    if (error?.code === UNIQUE_VIOLATION) {
      // A concurrent first sign-in created the row; update it instead.
      const id = await this.findIdBySub(identity.sub);
      if (id) return { user: await this.updateProfile(id, profile), created: false };
    }
    if (error || !data)
      throw new UpstreamUnavailableException('supabase', op, error?.message ?? 'no row');
    return { user: toRecord(data), created: true };
  }

  async findById(id: string): Promise<UserRecord | null> {
    const op = 'users.find_by_id';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db.from('users').select(COLUMNS).eq('id', id).maybeSingle<UserRow>(),
    );
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    return data ? toRecord(data) : null;
  }

  private async findIdBySub(sub: string): Promise<string | null> {
    const op = 'users.find_by_sub';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db.from('users').select('id').eq('google_sub', sub).maybeSingle<{ id: string }>(),
    );
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    return data?.id ?? null;
  }

  private async updateProfile(id: string, profile: Record<string, unknown>): Promise<UserRecord> {
    const op = 'users.update_profile';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db.from('users').update(profile).eq('id', id).select(COLUMNS).single<UserRow>(),
    );
    if (error || !data)
      throw new UpstreamUnavailableException('supabase', op, error?.message ?? 'no row');
    return toRecord(data);
  }
}
