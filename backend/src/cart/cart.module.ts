import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module';
import { CartController } from './cart.controller';
import { CART_REPOSITORY } from './cart.repository';
import { CartService } from './cart.service';
import { SupabaseCartRepository } from './supabase-cart.repository';

@Module({
  imports: [MenuModule],
  controllers: [CartController],
  providers: [CartService, { provide: CART_REPOSITORY, useClass: SupabaseCartRepository }],
})
export class CartModule {}
