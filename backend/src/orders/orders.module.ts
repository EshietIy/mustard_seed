import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module';
import { SiteModule } from '../site/site.module';
import { OrdersController } from './orders.controller';
import { ORDERS_REPOSITORY } from './orders.repository';
import { OrdersService } from './orders.service';
import { SupabaseOrdersRepository } from './supabase-orders.repository';

@Module({
  imports: [MenuModule, SiteModule],
  controllers: [OrdersController],
  providers: [OrdersService, { provide: ORDERS_REPOSITORY, useClass: SupabaseOrdersRepository }],
  exports: [OrdersService, ORDERS_REPOSITORY],
})
export class OrdersModule {}
