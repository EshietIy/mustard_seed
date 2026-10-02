import { Module } from '@nestjs/common';
import type { Logger } from 'pino';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { ROOT_LOGGER } from '../logging/logger.token';
import { MenuModule } from '../menu/menu.module';
import { OrdersModule } from '../orders/orders.module';
import { SiteModule } from '../site/site.module';
import { UsersModule } from '../users/users.module';
import { EmailDispatcher } from './email-dispatcher';
import { EMAIL_OUTBOX } from './email-outbox.repository';
import { MAIL_PROVIDER, type MailProvider } from './mail-provider';
import { OrderEmailBuilder } from './order-email.builder';
import { InMemoryMailProvider } from './providers/in-memory.provider';
import { LogMailProvider } from './providers/log.provider';
import { MailgunProvider } from './providers/mailgun.provider';
import { SupabaseEmailOutbox } from './supabase-email-outbox.repository';

function mailProvider(config: AppConfig, logger: Logger): MailProvider {
  switch (config.MAIL_PROVIDER) {
    case 'mailgun':
      return new MailgunProvider(config);
    case 'memory':
      return new InMemoryMailProvider();
    default:
      return new LogMailProvider(logger);
  }
}

@Module({
  imports: [OrdersModule, UsersModule, MenuModule, SiteModule],
  providers: [
    OrderEmailBuilder,
    EmailDispatcher,
    { provide: EMAIL_OUTBOX, useClass: SupabaseEmailOutbox },
    { provide: MAIL_PROVIDER, useFactory: mailProvider, inject: [APP_CONFIG, ROOT_LOGGER] },
  ],
  exports: [EmailDispatcher, MAIL_PROVIDER],
})
export class MailModule {}
