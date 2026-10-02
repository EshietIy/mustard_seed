import { MailSendError } from '../mail-provider';
import { MailgunProvider } from './mailgun.provider';

const config = {
  MAILGUN_API_KEY: 'key-0123456789abcdef',
  MAILGUN_DOMAIN: 'mg.mustardseed.ng',
  MAILGUN_BASE_URL: 'https://api.eu.mailgun.net/',
};
const message = {
  to: 'ada@example.com',
  from: 'Mustard Seed Restaurant & Bar <orders@mustardseed.ng>',
  replyTo: 'help@mustardseed.ng',
  subject: 'Payment received — your Mustard Seed order #MS-0001',
  html: '<p>Hi</p>',
  text: 'Hi',
  tags: ['order-confirmation'],
};

describe('MailgunProvider', () => {
  it('posts the message to the Mailgun messages API with basic auth', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: '<20261005.abc@mg.mustardseed.ng>', message: 'Queued. Thank you.' }),
          { status: 200 },
        ),
      );
    await expect(new MailgunProvider(config, fetchMock).send(message)).resolves.toEqual({
      providerMessageId: '<20261005.abc@mg.mustardseed.ng>',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.eu.mailgun.net/v3/mg.mustardseed.ng/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('api:key-0123456789abcdef').toString('base64')}`,
    );
    const form = init.body as URLSearchParams;
    expect(form.get('to')).toBe('ada@example.com');
    expect(form.get('from')).toBe(message.from);
    expect(form.get('subject')).toBe(message.subject);
    expect(form.get('html')).toBe('<p>Hi</p>');
    expect(form.get('text')).toBe('Hi');
    expect(form.get('h:Reply-To')).toBe('help@mustardseed.ng');
    expect(form.getAll('o:tag')).toEqual(['order-confirmation']);
  });

  it.each([
    [401, 'Forbidden'],
    [400, 'to parameter is not a valid address'],
    [500, 'internal'],
  ])('throws a MailSendError on HTTP %i', async (status, text) => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: text }), { status }));
    const err = await new MailgunProvider(config, fetchMock).send(message).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailSendError);
    expect((err as MailSendError).upstreamStatus).toBe(status);
    expect((err as Error).message).toContain(text);
  });

  it('throws a MailSendError on network failure or a response without an id', async () => {
    await expect(
      new MailgunProvider(config, jest.fn().mockRejectedValue(new TypeError('fetch failed'))).send(
        message,
      ),
    ).rejects.toBeInstanceOf(MailSendError);
    await expect(
      new MailgunProvider(
        config,
        jest.fn().mockResolvedValue(new Response('{}', { status: 200 })),
      ).send(message),
    ).rejects.toBeInstanceOf(MailSendError);
  });
});
