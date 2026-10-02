import { MailSendError, type MailMessage, type MailProvider } from '../mail-provider';

interface MailgunConfig {
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  MAILGUN_BASE_URL: string;
}

/** Mailgun HTTP API (https://documentation.mailgun.com). US or EU region via MAILGUN_BASE_URL. */
export class MailgunProvider implements MailProvider {
  readonly name = 'mailgun';

  constructor(
    private readonly config: MailgunConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<{ providerMessageId: string }> {
    const form = new URLSearchParams();
    form.set('from', message.from);
    form.set('to', message.to);
    form.set('subject', message.subject);
    form.set('text', message.text);
    form.set('html', message.html);
    if (message.replyTo) form.set('h:Reply-To', message.replyTo);
    for (const tag of message.tags ?? []) form.append('o:tag', tag);

    const base = this.config.MAILGUN_BASE_URL.replace(/\/+$/, '');
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}/v3/${this.config.MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${this.config.MAILGUN_API_KEY}`).toString('base64')}`,
        },
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new MailSendError(
        `Mailgun unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      throw new MailSendError(`Mailgun HTTP ${res.status}: ${body.message ?? 'error'}`, res.status);
    }
    if (!body.id)
      throw new MailSendError('Mailgun accepted the message but returned no id', res.status);
    return { providerMessageId: body.id };
  }
}
