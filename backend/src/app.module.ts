import { DynamicModule, Module, Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Logger } from 'pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { AppConfig } from './config/env.validation';
import { ConfigPublicModule } from './config-public/config-public.module';
import { CoreModule } from './core.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MenuModule } from './menu/menu.module';
import { SiteModule } from './site/site.module';
import { ROOT_LOGGER } from './logging/logger.token';
import { resolveLimit } from './throttling/throttling';

@Module({})
export class AppModule {
  static register(
    config: AppConfig,
    logger: Logger,
    extraModules: Array<Type | DynamicModule> = [],
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.register(config, logger),
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
        ...extraModules,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: APP_FILTER,
          useFactory: (rootLogger: Logger) => new AllExceptionsFilter(rootLogger),
          inject: [ROOT_LOGGER],
        },
      ],
    };
  }
}
