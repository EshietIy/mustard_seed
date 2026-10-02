import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import request from 'supertest';
import { testSupabaseEnv } from '../support/test-database';
import { ApiWorld, DEFAULT_ENV, getPath, LogEntry, SITE_ORIGIN } from '../support/world';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options';

/** Builds a request that behaves like the site in a browser: session cookie + allowed Origin. */
export function req(world: ApiWorld, method: Method, path: string) {
  let r = request(world.server())[method](path);
  if (world.sessionCookie) r = r.set('Cookie', world.sessionCookie);
  if (method !== 'get' && method !== 'options') r = r.set('Origin', SITE_ORIGIN);
  return r;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LEVELS: Record<string, number> = { debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

// ---------- app lifecycle ----------

Given('the API is running', async function (this: ApiWorld) {
  await this.start(DEFAULT_ENV);
});

Given('the API is running with:', async function (this: ApiWorld, table: DataTable) {
  await this.start({ ...DEFAULT_ENV, ...table.rowsHash() });
});

When('the API starts with:', async function (this: ApiWorld, table: DataTable) {
  try {
    // Database settings are supplied unless the scenario overrides or blanks them.
    const env: Record<string, string> = {
      ...testSupabaseEnv(),
      GOOGLE_CLIENT_ID: DEFAULT_ENV.GOOGLE_CLIENT_ID,
      JWT_SECRET: DEFAULT_ENV.JWT_SECRET,
      ...table.rowsHash(),
    };
    for (const [k, v] of Object.entries(env)) if (v === '<unset>') delete env[k];
    await this.start(env);
  } catch (err) {
    this.startupError = err as Error;
  }
});

Then('startup fails with a message containing {string}', function (this: ApiWorld, text: string) {
  assert.ok(this.startupError, 'expected startup to fail');
  assert.ok(this.app === undefined, 'app should not be running');
  assert.match(this.startupError.message, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

Then('startup succeeds', function (this: ApiWorld) {
  assert.equal(this.startupError, undefined, this.startupError?.message);
  assert.ok(this.app);
});

// ---------- requests ----------

When('I GET {string}', async function (this: ApiWorld, path: string) {
  this.response = await req(this, 'get', path);
});

When('I GET {string} {int} times', async function (this: ApiWorld, path: string, n: number) {
  for (let i = 0; i < n; i++) this.response = await req(this, 'get', path);
});

When('I POST {string}', async function (this: ApiWorld, path: string) {
  this.response = await req(this, 'post', path);
});

When('I POST {string} {int} times', async function (this: ApiWorld, path: string, n: number) {
  for (let i = 0; i < n; i++) this.response = await req(this, 'post', path);
});

When('I PATCH {string} with JSON:', async function (this: ApiWorld, path: string, body: string) {
  this.response = await req(this, 'patch', path).set('Content-Type', 'application/json').send(body);
});

When(
  'I POST {string} with JSON from origin {string}:',
  async function (this: ApiWorld, path: string, origin: string, body: string) {
    let r = request(this.server()).post(path).set('Content-Type', 'application/json');
    if (this.sessionCookie) r = r.set('Cookie', this.sessionCookie);
    if (origin !== 'none') r = r.set('Origin', origin);
    this.response = await r.send(body);
  },
);

When('I POST {string} with JSON:', async function (this: ApiWorld, path: string, body: string) {
  this.response = await req(this, 'post', path).set('Content-Type', 'application/json').send(body);
});

When(
  'I POST {string} with raw body {string} and content type {string}',
  async function (this: ApiWorld, path: string, body: string, type: string) {
    this.response = await request(this.server()).post(path).set('Content-Type', type).send(body);
  },
);

When(
  'I GET {string} with headers:',
  async function (this: ApiWorld, path: string, table: DataTable) {
    this.response = await req(this, 'get', path).set(table.rowsHash());
  },
);

When(
  'I GET {string} from origin {string}',
  async function (this: ApiWorld, path: string, origin: string) {
    this.response = await request(this.server()).get(path).set('Origin', origin);
  },
);

When(
  'I send a preflight for {string} {string} from origin {string}',
  async function (this: ApiWorld, method: string, path: string, origin: string) {
    this.response = await request(this.server())
      .options(path)
      .set('Origin', origin)
      .set('Access-Control-Request-Method', method);
  },
);

// ---------- response assertions ----------

Then('the response status is {int}', function (this: ApiWorld, status: number) {
  assert.equal(this.res().status, status, this.res().text);
});

Then('the response JSON is:', function (this: ApiWorld, expected: string) {
  assert.deepEqual(this.res().body, JSON.parse(expected));
});

Then(
  'the response JSON at {string} is {string}',
  function (this: ApiWorld, path: string, expected: string) {
    assert.equal(getPath(this.res().body, path), expected);
  },
);

Then('the response JSON at {string} is a UUID', function (this: ApiWorld, path: string) {
  assert.match(String(getPath(this.res().body, path)), UUID_RE);
});

Then(
  'the response JSON at {string} equals the response header {string}',
  function (this: ApiWorld, path: string, header: string) {
    assert.equal(getPath(this.res().body, path), this.res().headers[header]);
  },
);

Then(
  'the response JSON at {string} includes a field error for {string}',
  function (this: ApiWorld, path: string, field: string) {
    const details = getPath(this.res().body, path) as Array<{ field: string; messages: string[] }>;
    const match = details.find((d) => d.field === field);
    assert.ok(match, `no field error for ${field} in ${JSON.stringify(details)}`);
    assert.ok(match.messages.length > 0);
  },
);

Then('the response body does not contain {string}', function (this: ApiWorld, text: string) {
  assert.ok(!this.res().text.includes(text), `body contains "${text}": ${this.res().text}`);
});

Then(
  'the response header {string} is {string}',
  function (this: ApiWorld, name: string, expected: string) {
    assert.equal(this.res().headers[name.toLowerCase()], expected);
  },
);

Then(
  'the response header {string} contains {string}',
  function (this: ApiWorld, name: string, expected: string) {
    const value = String(this.res().headers[name.toLowerCase()] ?? '');
    assert.ok(value.includes(expected), `${name}: "${value}" does not contain "${expected}"`);
  },
);

Then('the response header {string} is absent', function (this: ApiWorld, name: string) {
  assert.equal(this.res().headers[name.toLowerCase()], undefined);
});

Then('the response header {string} is a UUID', function (this: ApiWorld, name: string) {
  assert.match(String(this.res().headers[name.toLowerCase()]), UUID_RE);
});

Then('the response header {string} is a positive integer', function (this: ApiWorld, name: string) {
  const value = Number(this.res().headers[name.toLowerCase()]);
  assert.ok(Number.isInteger(value) && value > 0, `${name} = ${String(value)}`);
});

// ---------- log assertions ----------

async function waitForLog(
  world: ApiWorld,
  predicate: (e: LogEntry) => boolean,
): Promise<LogEntry | undefined> {
  for (let i = 0; i < 50; i++) {
    const found = world.logs.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 10));
  }
  return undefined;
}

Then(
  /^an? "(\w+)" log entry has:$/,
  async function (this: ApiWorld, level: string, table: DataTable) {
    const expected = table.rowsHash();
    const entry = await waitForLog(
      this,
      (e) =>
        e.level === LEVELS[level] &&
        Object.entries(expected).every(([k, v]) => String(getPath(e, k)) === v),
    );
    assert.ok(
      entry,
      `no ${level} log matching ${JSON.stringify(expected)}\nlogs:\n${this.logs.map((l) => JSON.stringify(l)).join('\n')}`,
    );
    this.matchedLog = entry;
  },
);

Then('that log entry has a {string} number', function (this: ApiWorld, field: string) {
  assert.equal(typeof getPath(this.matchedLog, field), 'number');
});

Then(
  "that log entry's {string} equals the response header {string}",
  function (this: ApiWorld, field: string, header: string) {
    assert.equal(getPath(this.matchedLog, field), this.res().headers[header]);
  },
);

Then('no log entry contains {string}', async function (this: ApiWorld, text: string) {
  await new Promise((r) => setTimeout(r, 50));
  const leaked = this.logs.find((l) => JSON.stringify(l).includes(text));
  assert.equal(leaked, undefined, `log leaked "${text}": ${JSON.stringify(leaked)}`);
});
