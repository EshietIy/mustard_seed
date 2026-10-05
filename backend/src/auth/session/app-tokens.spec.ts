import { SessionTokens } from './session-tokens';
import { AppTokens } from './app-tokens';

const config = { JWT_SECRET: 'x'.repeat(48), APP_ACCESS_TTL_MINUTES: 15 };
const now = new Date('2026-10-05T12:00:00Z');

describe('AppTokens', () => {
  it('issues a short-lived access token that verifies back to the user', async () => {
    const tokens = new AppTokens(config);
    const { token, expiresAt } = await tokens.issueAccess('user-1', now);
    expect(expiresAt.toISOString()).toBe('2026-10-05T12:15:00.000Z');
    await expect(tokens.verifyAccess(token, now)).resolves.toEqual({ userId: 'user-1' });
    await expect(tokens.verifyAccess(token, new Date('2026-10-05T12:16:00Z'))).resolves.toBeNull();
  });

  it('never accepts a web session token as an app token, or the other way round', async () => {
    const app = new AppTokens(config);
    const web = new SessionTokens(config);
    const webToken = (await web.issue('user-1', 1, now)).token;
    const appToken = (await app.issueAccess('user-1', now)).token;
    await expect(app.verifyAccess(webToken, now)).resolves.toBeNull();
    await expect(web.verify(appToken, now)).resolves.toBeNull();
  });

  it('rejects garbage and tokens signed with another secret', async () => {
    const tokens = new AppTokens(config);
    const other = new AppTokens({ ...config, JWT_SECRET: 'y'.repeat(48) });
    await expect(tokens.verifyAccess('not-a-jwt', now)).resolves.toBeNull();
    await expect(
      tokens.verifyAccess((await other.issueAccess('user-1', now)).token, now),
    ).resolves.toBeNull();
  });

  it('makes random refresh tokens and stores only their SHA-256 hash', () => {
    const tokens = new AppTokens(config);
    const a = tokens.newRefreshToken();
    const b = tokens.newRefreshToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hash(a.token)).toBe(a.hash);
  });
});
