import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { SettingsController } from './settings.controller';
import { SETTINGS_REPOSITORY } from './settings.repository';
import { SettingsService } from './settings.service';
import { SupabaseSettingsRepository } from './supabase-settings.repository';

@Module({
  imports: [OrdersModule],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    { provide: SETTINGS_REPOSITORY, useClass: SupabaseSettingsRepository },
  ],
})
export class SettingsModule {}
