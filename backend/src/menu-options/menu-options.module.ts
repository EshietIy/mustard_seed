import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { MenuOptionsController } from './menu-options.controller';
import { MENU_OPTIONS_REPOSITORY } from './menu-options.repository';
import { MenuOptionsService } from './menu-options.service';
import { SupabaseMenuOptionsRepository } from './supabase-menu-options.repository';

@Module({
  imports: [OrdersModule],
  controllers: [MenuOptionsController],
  providers: [
    MenuOptionsService,
    { provide: MENU_OPTIONS_REPOSITORY, useClass: SupabaseMenuOptionsRepository },
  ],
})
export class MenuOptionsModule {}
