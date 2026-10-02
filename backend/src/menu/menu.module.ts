import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MENU_REPOSITORY } from './menu.repository';
import { MenuService } from './menu.service';
import { SupabaseMenuRepository } from './supabase-menu.repository';

@Module({
  controllers: [MenuController],
  providers: [MenuService, { provide: MENU_REPOSITORY, useClass: SupabaseMenuRepository }],
})
export class MenuModule {}
