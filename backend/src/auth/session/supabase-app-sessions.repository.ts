import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../../database/supabase.token';
import type { AppSessionsRepository, RotateOutcome } from './app-sessions.repository';

type Result = { data: unknown; error: { message: string } | null };

@Injectable()
export class SupabaseAppSessionsRepository implements AppSessionsRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async create(input: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.run('app_refresh_tokens.create', () =>
      this.db.from('app_refresh_tokens').insert({
        user_id: input.userId,
        family_id: input.familyId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt.toISOString(),
      }),
    );
  }

  async rotate(
    tokenHash: string,
    newTokenHash: string,
    newExpiresAt: Date,
    now: Date,
  ): Promise<{ outcome: RotateOutcome; userId: string | null }> {
    const data = await this.run('app_refresh_tokens.rotate', () =>
      this.db.rpc('rotate_app_refresh_token', {
        p_token_hash: tokenHash,
        p_new_token_hash: newTokenHash,
        p_new_expires_at: newExpiresAt.toISOString(),
        p_now: now.toISOString(),
      }),
    );
    const row = (data as Array<{ outcome: RotateOutcome; user_id: string | null }> | null)?.[0];
    if (!row)
      throw new UpstreamUnavailableException('supabase', 'app_refresh_tokens.rotate', 'no row');
    return { outcome: row.outcome, userId: row.user_id };
  }

  async revokeFamily(tokenHash: string, now: Date): Promise<void> {
    await this.run('app_refresh_tokens.revoke', () =>
      this.db.rpc('revoke_app_refresh_family', {
        p_token_hash: tokenHash,
        p_now: now.toISOString(),
      }),
    );
  }

  private async run(op: string, query: () => PromiseLike<Result>): Promise<unknown> {
    const { data, error } = await callUpstream<Result>('supabase', op, query);
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    return data;
  }
}
