import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';

/**
 * A stand-in for Google's JWKS endpoint. The backend's real verifier fetches keys from here
 * (GOOGLE_JWKS_URL) and checks tokens we sign with the matching private key, so the BDD suite
 * exercises the production verification code without calling Google.
 */
export const TEST_GOOGLE_CLIENT_ID = '1234567890-bddtest.apps.googleusercontent.com';

let server: Server | undefined;
let jwksUrl = '';
let privateKey: KeyLike;
let strangerKey: KeyLike;

export async function startFakeGoogle(): Promise<string> {
  if (server) return jwksUrl;
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  strangerKey = (await generateKeyPair('RS256')).privateKey;
  const jwk: JWK = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'bdd-key',
    alg: 'RS256',
    use: 'sig',
  };
  server = createServer((req, res) => {
    if (req.url === '/oauth2/v3/certs') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  jwksUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oauth2/v3/certs`;
  return jwksUrl;
}

export async function stopFakeGoogle(): Promise<void> {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
}

export interface TokenOptions {
  email: string;
  sub?: string;
  emailVerified?: boolean;
  givenName?: string;
  name?: string;
  audience?: string;
  issuer?: string;
  expiresIn?: string;
  signedByStranger?: boolean;
}

/** A Google-style ID token. Defaults describe a valid token for our client ID. */
export function googleIdToken(opts: TokenOptions): Promise<string> {
  const local = opts.email.split('@')[0] ?? 'user';
  return new SignJWT({
    email: opts.email,
    email_verified: opts.emailVerified ?? true,
    given_name: opts.givenName ?? local.charAt(0).toUpperCase() + local.slice(1),
    name: opts.name ?? `${local} Test`,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'bdd-key' })
    .setSubject(opts.sub ?? `google-${opts.email.toLowerCase()}`)
    .setIssuer(opts.issuer ?? 'https://accounts.google.com')
    .setAudience(opts.audience ?? TEST_GOOGLE_CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h')
    .sign(opts.signedByStranger ? strangerKey : privateKey);
}
