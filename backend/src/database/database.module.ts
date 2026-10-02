import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { createSupabaseClient } from './supabase.client';
import { SUPABASE_CLIENT } from './supabase.token';

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      useFactory: (config: AppConfig) => createSupabaseClient(config),
      inject: [APP_CONFIG],
    },
  ],
  exports: [SUPABASE_CLIENT],
})
export class DatabaseModule {}
