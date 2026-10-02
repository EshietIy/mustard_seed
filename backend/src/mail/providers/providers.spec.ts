import { MailSendError } from '../mail-provider';
import { InMemoryMailProvider } from './in-memory.provider';
import { LogMailProvider } from './log.provider';

const message = {
  to: 'ada@example.com',
  from: 'A <a@b.co>',
  subject: 'S',
  html: '<p>x</p>',
  text: 'x',
};

describe('LogMailProvider', () => {
  it('logs the recipient domain only and returns an id', async () => {
    const logger = { info: jest.fn() };
    const { providerMessageId } = await new LogMailProvider(logger).send(message);
    expect(providerMessageId).toMatch(/^log-/);
    const [fields] = logger.info.mock.calls[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({
      event: 'email.logged',
      recipientDomain: 'example.com',
      subject: 'S',
    });
    expect(JSON.stringify(fields)).not.toContain('ada@');
  });
});

describe('InMemoryMailProvider', () => {
  it('keeps sent messages and can fail on demand', async () => {
    const mail = new InMemoryMailProvider();
    mail.failNext(1);
    await expect(mail.send(message)).rejects.toBeInstanceOf(MailSendError);
    await expect(mail.send(message)).resolves.toEqual({ providerMessageId: '<memory-1@test>' });
    expect(mail.sent).toHaveLength(1);
    mail.reset();
    expect(mail.sent).toHaveLength(0);
  });
});
