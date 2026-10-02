export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailMessage {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /** Provider tags for analytics/filtering, e.g. "order-confirmation". */
  tags?: string[];
}

/** Thrown when the provider refuses or fails to accept a message. */
export class MailSendError extends Error {
  constructor(
    message: string,
    readonly upstreamStatus: number | null = null,
  ) {
    super(message);
    this.name = 'MailSendError';
  }
}

/**
 * The only way the app sends email (AGENT.md §10): Mailgun in real environments, a logging
 * provider locally and an in-memory one in tests, so tests never send real email.
 */
export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<{ providerMessageId: string }>;
}
