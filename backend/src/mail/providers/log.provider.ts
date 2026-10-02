import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { MailMessage, MailProvider } from '../mail-provider';

/** Local development: logs that an email would be sent (domain only), never sends. */
export class LogMailProvider implements MailProvider {
  readonly name = 'log';

  constructor(private readonly logger: Pick<Logger, 'info'>) {}

  send(message: MailMessage): Promise<{ providerMessageId: string }> {
    const providerMessageId = `log-${randomUUID()}`;
    this.logger.info(
      {
        event: 'email.logged',
        recipientDomain: message.to.slice(message.to.lastIndexOf('@') + 1),
        subject: message.subject,
        htmlBytes: Buffer.byteLength(message.html),
        providerMessageId,
      },
      'Email not sent (MAIL_PROVIDER=log)',
    );
    return Promise.resolve({ providerMessageId });
  }
}
