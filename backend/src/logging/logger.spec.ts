import { createRootLogger } from './logger';
import { AppEnv, type AppConfig } from '../config/env.validation';

function capture(level: AppConfig['LOG_LEVEL'] = 'info') {
  const lines: Record<string, unknown>[] = [];
  const logger = createRootLogger({ APP_ENV: AppEnv.Test, LOG_LEVEL: level } as AppConfig, {
    write: (s: string) => lines.push(JSON.parse(s) as Record<string, unknown>),
  });
  return { lines, logger };
}

describe('createRootLogger', () => {
  it('writes structured JSON with service and env', () => {
    const { lines, logger } = capture();
    logger.info({ orderId: 'o1' }, 'hello');
    expect(lines[0]).toMatchObject({
      service: 'mustard-seed-api',
      env: 'test',
      orderId: 'o1',
      msg: 'hello',
    });
    expect(typeof lines[0].time).toBe('string');
  });

  it('respects the configured level', () => {
    const { lines, logger } = capture('warn');
    logger.info('dropped');
    logger.warn('kept');
    expect(lines.map((l) => l.msg)).toEqual(['kept']);
  });

  it('redacts secrets and personal data', () => {
    const { lines, logger } = capture();
    logger.info(
      {
        user: { email: 'ada@example.com', password: 'pw' },
        auth: { token: 't0k', idToken: 'gid', jwt: 'j' },
        paystack: { secretKey: 'sk_test_1' },
        mailgun: { apiKey: 'key-1' },
        supabase: { serviceRoleKey: 'srk' },
      },
      'sensitive',
    );
    const out = JSON.stringify(lines[0]);
    for (const secret of [
      'ada@example.com',
      'pw',
      't0k',
      'gid',
      '"j"',
      'sk_test_1',
      'key-1',
      'srk',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[REDACTED]');
  });
});
