import { DynamicModule, Module, Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Logger } from 'pino';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/guards/auth.guard';
import { OriginGuard } from './auth/guards/origin.guard';
import { systemClock, type Clock } from './common/clock';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { AppConfig } from './config/env.validation';
import { ConfigPublicModule } from './config-public/config-public.module';
import { CoreModule } from './core.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PaystackSimulatorModule } from './simulator/paystack/simulator.module';
import { SiteModule } from './site/site.module';
import { ROOT_LOGGER } from './logging/logger.token';
import { resolveLimit } from './throttling/throttling';

@Module({})
export class AppModule {
  static register(
    config: AppConfig,
    logger: Logger,
    extraModules: Array<Type | DynamicModule> = [],
    clock: Clock = systemClock,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.register(config, logger, clock),
        DatabaseModule,
        ThrottlerModule.forRoot({
          throttlers: [
            { name: 'default', ttl: config.THROTTLE_TTL_MS, limit: resolveLimit(config) },
          ],
        }),
        HealthModule,
        ConfigPublicModule,
        MenuModule,
        SiteModule,
        AuthModule,
        OrdersModule,
        PaymentsModule,
        // Never mounted unless explicitly enabled (and never in production; see env checks).
        ...(config.PAYSTACK_SIMULATOR_ENABLED ? [PaystackSimulatorModule] : []),
        ...extraModules,
      ],
      providers: [
        // Global guards run in this order: rate limit, CSRF origin check, then
        // authentication/roles (deny by default; see @Public / @Roles).
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useExisting: OriginGuard },
        { provide: APP_GUARD, useExisting: AuthGuard },
        {
          provide: APP_FILTER,
          useFactory: (rootLogger: Logger) => new AllExceptionsFilter(rootLogger),
          inject: [ROOT_LOGGER],
        },
      ],
    };
  }
}
