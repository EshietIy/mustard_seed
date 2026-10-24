import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import { IMAGE_CACHE_SECONDS, type ImageStorage } from './image-storage';

const UPSTREAM = 'supabase-storage';

type StorageResult = { data: unknown; error: { message: string } | null };

/** Photos in the public Supabase Storage bucket from config (AGENT.md 3.1). */
@Injectable()
export class SupabaseImageStorage implements ImageStorage {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'SUPABASE_STORAGE_BUCKET'>,
  ) {}

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.call('images.put', () =>
      this.bucket().upload(key, data, {
        contentType,
        cacheControl: String(IMAGE_CACHE_SECONDS),
        upsert: false,
      }),
    );
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.call('images.remove', () => this.bucket().remove(keys));
  }

  async usedBytes(): Promise<number> {
    const data = await this.call('images.usage', () =>
      this.db.rpc('storage_used_bytes', { bucket_name: this.config.SUPABASE_STORAGE_BUCKET }),
    );
    return Number(data ?? 0);
  }

  private bucket() {
    return this.db.storage.from(this.config.SUPABASE_STORAGE_BUCKET);
  }

  private async call(op: string, fn: () => PromiseLike<StorageResult>): Promise<unknown> {
    const { data, error } = await callUpstream(UPSTREAM, op, fn);
    if (error) throw new UpstreamUnavailableException(UPSTREAM, op, error.message);
    return data;
  }
}
