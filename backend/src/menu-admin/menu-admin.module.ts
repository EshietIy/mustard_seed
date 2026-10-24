import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { MenuAdminController } from './menu-admin.controller';
import { MENU_ADMIN_REPOSITORY } from './menu-admin.repository';
import { MenuAdminService } from './menu-admin.service';
import { SupabaseMenuAdminRepository } from './supabase-menu-admin.repository';

@Module({
  imports: [OrdersModule],
  controllers: [MenuAdminController],
  providers: [
    MenuAdminService,
    { provide: MENU_ADMIN_REPOSITORY, useClass: SupabaseMenuAdminRepository },
  ],
})
export class MenuAdminModule {}
