import { MailSendError, type MailMessage, type MailProvider } from '../mail-provider';

/** Automated tests only (MAIL_PROVIDER=memory): keeps messages in memory, can simulate failures. */
export class InMemoryMailProvider implements MailProvider {
  readonly name = 'memory';
  readonly sent: Array<MailMessage & { providerMessageId: string }> = [];
  private failuresLeft = 0;
  private sequence = 0;

  /** The next `count` sends fail like a Mailgun outage. */
  failNext(count = 1): void {
    this.failuresLeft = count;
  }

  reset(): void {
    this.sent.length = 0;
    this.failuresLeft = 0;
  }

  send(message: MailMessage): Promise<{ providerMessageId: string }> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return Promise.reject(new MailSendError('Simulated Mailgun outage', 503));
    }
    const providerMessageId = `<memory-${++this.sequence}@test>`;
    this.sent.push({ ...message, providerMessageId });
    return Promise.resolve({ providerMessageId });
  }
}
