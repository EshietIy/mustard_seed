import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { OrdersModule } from '../orders/orders.module';
import { PaymentExpirySweeper } from './payment-expiry.sweeper';
import { PAYMENT_GATEWAY } from './payment-gateway';
import { PaymentsController } from './payments.controller';
import { PAYMENTS_REPOSITORY } from './payments.repository';
import { PaymentsService } from './payments.service';
import { PaystackGateway } from './paystack.gateway';
import { SupabasePaymentsRepository } from './supabase-payments.repository';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentExpirySweeper,
    { provide: PAYMENTS_REPOSITORY, useClass: SupabasePaymentsRepository },
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (config: AppConfig) => new PaystackGateway(config),
      inject: [APP_CONFIG],
    },
  ],
  exports: [PaymentsService, PaymentExpirySweeper],
})
export class PaymentsModule {}
