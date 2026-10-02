import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { UnauthorizedException } from '@nestjs/common';
import { UpstreamUnavailableException } from '../../common/errors/upstream-unavailable.exception';
import { JoseGoogleIdTokenVerifier } from './jose-google-id-token.verifier';

const CLIENT_ID = '123-abc.apps.googleusercontent.com';

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const verifier = new JoseGoogleIdTokenVerifier(
    { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_JWKS_URL: 'http://unused' },
    createLocalJWKSet({ keys: [jwk] }),
  );
  const sign = (
    claims: Record<string, unknown>,
    opts: { aud?: string; iss?: string; exp?: string } = {},
  ) =>
    new SignJWT({
      email: 'Ada@Example.com',
      email_verified: true,
      given_name: 'Ada',
      name: 'Ada Obi',
      picture: 'https://lh3.googleusercontent.com/a',
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject('google-sub-1')
      .setIssuer(opts.iss ?? 'https://accounts.google.com')
      .setAudience(opts.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(privateKey);
  return { verifier, sign };
}

describe('JoseGoogleIdTokenVerifier', () => {
  it('returns the identity for a valid token, with the email lower-cased', async () => {
    const { verifier, sign } = await setup();
    await expect(verifier.verify(await sign({}))).resolves.toEqual({
      sub: 'google-sub-1',
      email: 'ada@example.com',
      emailVerified: true,
      firstName: 'Ada',
      fullName: 'Ada Obi',
      avatarUrl: 'https://lh3.googleusercontent.com/a',
    });
  });

  it('accepts the bare accounts.google.com issuer', async () => {
    const { verifier, sign } = await setup();
    await expect(
      verifier.verify(await sign({}, { iss: 'accounts.google.com' })),
    ).resolves.toBeTruthy();
  });

  it('reports an unverified email (the service refuses it)', async () => {
    const { verifier, sign } = await setup();
    const identity = await verifier.verify(await sign({ email_verified: false }));
    expect(identity.emailVerified).toBe(false);
  });

  it('drops non-https avatars and tolerates missing names', async () => {
    const { verifier, sign } = await setup();
    const identity = await verifier.verify(
      await sign({ picture: 'http://insecure/a.png', given_name: undefined, name: undefined }),
    );
    expect(identity).toMatchObject({ avatarUrl: null, firstName: '', fullName: '' });
  });

  it.each([
    ['wrong audience', { aud: 'other.apps.googleusercontent.com' }],
    ['wrong issuer', { iss: 'https://evil.example.com' }],
    ['expired', { exp: '-1m' }],
  ])('rejects a token with the %s', async (_label, opts) => {
    const { verifier, sign } = await setup();
    await expect(verifier.verify(await sign({}, opts))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token without an email', async () => {
    const { verifier, sign } = await setup();
    await expect(verifier.verify(await sign({ email: undefined }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token signed by an unknown key and garbage input', async () => {
    const { verifier } = await setup();
    const other = await setup();
    await expect(verifier.verify(await other.sign({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(verifier.verify('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('maps an unreachable key server to a 503', async () => {
    const { sign } = await setup();
    const verifier = new JoseGoogleIdTokenVerifier({
      GOOGLE_CLIENT_ID: CLIENT_ID,
      GOOGLE_JWKS_URL: 'http://127.0.0.1:9/certs',
    });
    await expect(verifier.verify(await sign({}))).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
  });
});
