import { DynamicModule, Global, Module } from '@nestjs/common';
import type { Logger } from 'pino';
import { CLOCK, type Clock } from './common/clock';
import { createOrderEvents, ORDER_EVENTS } from './common/order-events';
import { APP_CONFIG } from './config/app-config.token';
import type { AppConfig } from './config/env.validation';
import { ROOT_LOGGER } from './logging/logger.token';

/** Makes the validated config and the root logger injectable everywhere. */
@Global()
@Module({})
export class CoreModule {
  static register(config: AppConfig, logger: Logger, clock: Clock): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: ROOT_LOGGER, useValue: logger },
        { provide: CLOCK, useValue: clock },
        { provide: ORDER_EVENTS, useValue: createOrderEvents() },
      ],
      exports: [APP_CONFIG, ROOT_LOGGER, CLOCK, ORDER_EVENTS],
    };
  }
}
