import { SignJWT } from 'jose';
import { SessionTokens } from './session-tokens';

const secret = 'x'.repeat(48);

describe('SessionTokens', () => {
  const tokens = new SessionTokens({ JWT_SECRET: secret });

  it('issues a token that verifies back to the user id', async () => {
    const now = new Date('2026-10-03T10:00:00Z');
    const { token, expiresAt } = await tokens.issue('user-1', 12, now);
    expect(expiresAt.toISOString()).toBe('2026-10-03T22:00:00.000Z');
    await expect(tokens.verify(token, now)).resolves.toEqual({ userId: 'user-1' });
  });

  it('rejects an expired token', async () => {
    const issued = new Date('2026-10-01T00:00:00Z');
    const { token } = await tokens.issue('user-1', 1, issued);
    await expect(tokens.verify(token, new Date('2026-10-01T02:00:00Z'))).resolves.toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const other = new SessionTokens({ JWT_SECRET: 'y'.repeat(48) });
    const { token } = await other.issue('user-1', 1);
    await expect(tokens.verify(token)).resolves.toBeNull();
  });

  it('rejects garbage and tokens for another audience', async () => {
    await expect(tokens.verify('not.a.jwt')).resolves.toBeNull();
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('mustard-seed-api')
      .setAudience('someone-else')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));
    await expect(tokens.verify(foreign)).resolves.toBeNull();
  });

  it('rejects the "none" algorithm', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: 'user-1', iss: 'mustard-seed-api', aud: 'mustard-seed-web', exp: 9e9 }),
    ).toString('base64url');
    await expect(tokens.verify(`${header}.${body}.`)).resolves.toBeNull();
  });
});
