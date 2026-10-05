import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import request from 'supertest';
import { googleIdToken } from '../support/fake-google';
import { ApiWorld, DEFAULT_ENV } from '../support/world';
import { resolveRefs } from './options.steps';

/** What the Android app keeps between requests. */
interface AppState {
  accessToken?: string;
  refreshToken?: string;
  previousRefreshToken?: string;
  version?: string;
}
const app = (world: ApiWorld): AppState => {
  const w = world as ApiWorld & { appState?: AppState };
  w.appState ??= {};
  return w.appState;
};

/** A request as the app sends it: no cookie, no browser Origin; bearer token if it has one. */
function appRequest(world: ApiWorld, method: 'get' | 'post' | 'put' | 'delete', path: string) {
  let r = request(world.server())[method](path).set('Accept', 'application/json');
  const state = app(world);
  if (state.accessToken) r = r.set('Authorization', `Bearer ${state.accessToken}`);
  if (state.version) r = r.set('X-App-Version', state.version);
  return r;
}

function keepTokens(world: ApiWorld): void {
  if (world.res().status !== 200) return;
  const body = world.res().body as { accessToken: string; refreshToken: string };
  const state = app(world);
  state.previousRefreshToken = state.refreshToken;
  state.accessToken = body.accessToken;
  state.refreshToken = body.refreshToken;
}

Given('the app is version {string}', function (this: ApiWorld, version: string) {
  app(this).version = version;
});

When(
  /^the app signs in with Google as "([^"]+)"( with an unverified email)?$/,
  async function (this: ApiWorld, email: string, unverified?: string) {
    if (!this.app) await this.start(DEFAULT_ENV);
    const idToken = await googleIdToken({ email, emailVerified: !unverified });
    this.response = await appRequest(this, 'post', '/api/v1/auth/app/google').send({ idToken });
    keepTokens(this);
  },
);

When('the app refreshes its tokens', async function (this: ApiWorld) {
  this.response = await appRequest(this, 'post', '/api/v1/auth/app/refresh').send({
    refreshToken: app(this).refreshToken,
  });
  keepTokens(this);
});

When('someone replays the previous refresh token', async function (this: ApiWorld) {
  this.response = await appRequest(this, 'post', '/api/v1/auth/app/refresh').send({
    refreshToken: app(this).previousRefreshToken,
  });
});

When('the app signs out', async function (this: ApiWorld) {
  this.response = await appRequest(this, 'post', '/api/v1/auth/app/logout').send({
    refreshToken: app(this).refreshToken,
  });
});

When(
  /^the app (GET|DELETE)s "([^"]+)"$/,
  async function (this: ApiWorld, method: string, path: string) {
    this.response = await appRequest(this, method.toLowerCase() as 'get' | 'delete', path);
  },
);

When(
  /^the app (POST|PUT)s "([^"]+)" with JSON:$/,
  async function (this: ApiWorld, method: string, path: string, body: string) {
    this.response = await appRequest(this, method.toLowerCase() as 'post' | 'put', path)
      .set('Content-Type', 'application/json')
      .send(await resolveRefs(body));
  },
);

When('the app uses the bearer token {string}', function (this: ApiWorld, token: string) {
  app(this).accessToken = token;
});

When('the app uses my website session cookie value as its bearer token', function (this: ApiWorld) {
  assert.ok(this.sessionCookie, 'not signed in on the website');
  app(this).accessToken = this.sessionCookie.split('=').slice(1).join('=');
});

Then('the response has app tokens for {string}', function (this: ApiWorld, email: string) {
  const body = this.res().body as Record<string, unknown> & { user: { email: string } };
  assert.equal(body.user.email, email);
  assert.match(String(body.accessToken), /^[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.match(String(body.refreshToken), /^[\w-]{43}$/);
  assert.ok(Date.parse(String(body.accessTokenExpiresAt)) > Date.now());
  assert.ok(
    Date.parse(String(body.refreshTokenExpiresAt)) > Date.parse(String(body.accessTokenExpiresAt)),
  );
  assert.equal(this.res().headers['set-cookie'], undefined, 'the app gets no cookie');
});

Then('no log entry contains the app tokens', async function (this: ApiWorld) {
  await new Promise((r) => setTimeout(r, 50));
  const state = app(this);
  const secrets = [state.accessToken, state.refreshToken, state.previousRefreshToken].filter(
    (s): s is string => !!s,
  );
  const text = JSON.stringify(this.logs);
  for (const secret of secrets) assert.ok(!text.includes(secret), 'a token reached the logs');
});
