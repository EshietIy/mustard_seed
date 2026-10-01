import { DynamicModule, Global, Module } from '@nestjs/common';
import type { Logger } from 'pino';
import { APP_CONFIG } from './config/app-config.token';
import type { AppConfig } from './config/env.validation';
import { ROOT_LOGGER } from './logging/logger.token';

/** Makes the validated config and the root logger injectable everywhere. */
@Global()
@Module({})
export class CoreModule {
  static register(config: AppConfig, logger: Logger): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: ROOT_LOGGER, useValue: logger },
      ],
      exports: [APP_CONFIG, ROOT_LOGGER],
    };
  }
}
