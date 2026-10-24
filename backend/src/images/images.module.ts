import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IMAGE_STORAGE, type ImageStorage } from './image-storage';
import { InMemoryImageStorage } from './in-memory-image-storage';
import { SupabaseImageStorage } from './supabase-image-storage';

/** Supabase Storage in the app; memory in automated tests (IMAGE_STORAGE=memory). */
export function imageStorage(config: AppConfig, db: SupabaseClient): ImageStorage {
  return config.IMAGE_STORAGE === 'memory'
    ? new InMemoryImageStorage()
    : new SupabaseImageStorage(db, config);
}

@Module({
  providers: [
    { provide: IMAGE_STORAGE, useFactory: imageStorage, inject: [APP_CONFIG, SUPABASE_CLIENT] },
  ],
  exports: [IMAGE_STORAGE],
})
export class ImagesModule {}
