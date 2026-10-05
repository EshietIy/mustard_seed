import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import request from 'supertest';
import pino from 'pino';
import { seedSuperAdmin } from '../../src/cli/seed-super-admin';
import { SESSION_COOKIE } from '../../src/auth/session/cookies';
import { SupabaseStaffRepository } from '../../src/staff/supabase-staff.repository';
import { googleIdToken, type TokenOptions } from '../support/fake-google';
import { testDb } from '../support/test-database';
import { ApiWorld, DEFAULT_ENV, LogEntry, SITE_ORIGIN } from '../support/world';

// ---------- helpers ----------

async function postSignIn(
  world: ApiWorld,
  credential: unknown,
  origin: string | null = SITE_ORIGIN,
) {
  let r = request(world.server())
    .post('/api/v1/auth/google')
    .set('Content-Type', 'application/json');
  if (origin) r = r.set('Origin', origin);
  world.response = await r.send(JSON.stringify({ credential }));
  return world.response;
}

function sessionCookieFrom(world: ApiWorld): string | undefined {
  const raw = world.res().headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const pair = cookie?.split(';')[0];
  return pair && pair !== `${SESSION_COOKIE}=` ? pair : undefined;
}

export async function signIn(world: ApiWorld, opts: TokenOptions): Promise<void> {
  const res = await postSignIn(world, await googleIdToken(opts));
  assert.equal(res.status, 200, res.text);
  const cookie = sessionCookieFrom(world);
  assert.ok(cookie, 'no session cookie set');
  world.sessionCookie = cookie;
  world.sessions.set(opts.email.toLowerCase(), cookie);
}

async function provision(email: string, role: string, active = true): Promise<void> {
  const { error } = await testDb()
    .from('staff_members')
    .insert({
      email: email.toLowerCase(),
      role,
      is_active: active,
      deactivated_at: active ? null : new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

async function staffId(email: string): Promise<string> {
  const { data, error } = await testDb()
    .from('staff_members')
    .select('id')
    .eq('email', email.toLowerCase())
    .single<{ id: string }>();
  if (error || !data) throw new Error(`no staff row for ${email}`);
  return data.id;
}

const ensureRunning = async (world: ApiWorld) => {
  if (!world.app) await world.start(DEFAULT_ENV);
};

// ---------- given ----------

Given(
  '{string} is provisioned as an active {string}',
  async function (email: string, role: string) {
    await provision(email, role, true);
  },
);

Given(
  '{string} is provisioned as a deactivated {string}',
  async function (email: string, role: string) {
    await provision(email, role, false);
  },
);

Given('I am signed in as {string}', async function (this: ApiWorld, email: string) {
  await ensureRunning(this);
  await signIn(this, { email });
});

Given('I am signed in as the super admin {string}', async function (this: ApiWorld, email: string) {
  await ensureRunning(this);
  await provision(email, 'super_admin', true);
  await signIn(this, { email });
});

Given('I am signed in as the supervisor {string}', async function (this: ApiWorld, email: string) {
  await ensureRunning(this);
  await provision(email, 'supervisor', true);
  await signIn(this, { email });
});

Given('I am not signed in', function (this: ApiWorld) {
  this.sessionCookie = undefined;
});

Given('my session cookie is tampered with', function (this: ApiWorld) {
  assert.ok(this.sessionCookie);
  this.sessionCookie = `${this.sessionCookie.slice(0, -4)}AAAA`;
});

Given('I act as {string}', function (this: ApiWorld, email: string) {
  const cookie = this.sessions.get(email.toLowerCase());
  assert.ok(cookie, `${email} has not signed in`);
  this.sessionCookie = cookie;
});

// ---------- when ----------

When('I sign in with Google as {string}', async function (this: ApiWorld, email: string) {
  await postSignIn(this, await googleIdToken({ email }));
  const cookie = sessionCookieFrom(this);
  if (cookie) {
    this.sessionCookie = cookie;
    this.sessions.set(email.toLowerCase(), cookie);
  }
});

When(
  'I sign in with Google as {string} with:',
  async function (this: ApiWorld, email: string, table: DataTable) {
    const t = table.rowsHash();
    await postSignIn(
      this,
      await googleIdToken({
        email,
        emailVerified:
          t['email verified'] === undefined ? undefined : t['email verified'] === 'yes',
        givenName: t['first name'],
        name: t['full name'],
        audience: t.audience,
        issuer: t.issuer,
        expiresIn: t['expires in'],
        signedByStranger: t['signed by'] === 'an unknown key',
      }),
    );
  },
);

When('I sign in with the credential {string}', async function (this: ApiWorld, credential: string) {
  await postSignIn(this, credential);
});

When(
  'I sign in with Google as {string} from origin {string}',
  async function (this: ApiWorld, email: string, origin: string) {
    await postSignIn(this, await googleIdToken({ email }), origin === 'none' ? null : origin);
  },
);

When('I send the sign-in body:', async function (this: ApiWorld, body: string) {
  this.response = await request(this.server())
    .post('/api/v1/auth/google')
    .set('Origin', SITE_ORIGIN)
    .set('Content-Type', 'application/json')
    .send(body);
});

When(
  'I sign in {int} times as {string}',
  async function (this: ApiWorld, n: number, email: string) {
    for (let i = 0; i < n; i++) await postSignIn(this, await googleIdToken({ email }));
  },
);

When(
  'I PATCH the staff member {string} with:',
  async function (this: ApiWorld, email: string, body: string) {
    const id = await staffId(email);
    this.response = await request(this.server())
      .patch(`/api/v1/admin/staff/${id}`)
      .set('Cookie', this.sessionCookie ?? '')
      .set('Origin', SITE_ORIGIN)
      .set('Content-Type', 'application/json')
      .send(body);
  },
);

When(
  'the seed script runs with SEED_SUPER_ADMIN_EMAIL {string}',
  async function (this: ApiWorld, email: string) {
    const logger = pino({}, { write: (s: string) => this.logs.push(JSON.parse(s) as LogEntry) });
    await seedSuperAdmin(new SupabaseStaffRepository(testDb()), email.trim().toLowerCase(), logger);
  },
);

// ---------- then ----------

Then('the response sets a secure session cookie', function (this: ApiWorld) {
  const raw = (this.res().headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const cookie = raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(cookie, `no ${SESSION_COOKIE} cookie in ${JSON.stringify(raw)}`);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Expires=']) {
    assert.ok(cookie.includes(flag), `cookie missing ${flag}: ${cookie}`);
  }
  assert.ok(!/Domain=/i.test(cookie), 'cookie must be host-only');
});

Then('the response clears the session cookie', function (this: ApiWorld) {
  const raw = (this.res().headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const cookie = raw.find((c) => c.startsWith(`${SESSION_COOKIE}=;`));
  assert.ok(cookie, `cookie not cleared: ${JSON.stringify(raw)}`);
  assert.ok(cookie.includes('Expires=Thu, 01 Jan 1970'), cookie);
});

Then('no session cookie is set', function (this: ApiWorld) {
  assert.equal(sessionCookieFrom(this), undefined);
});

Then(/^there (?:is|are) (\d+) users? in the database$/, async function (n: string) {
  const { count, error } = await testDb()
    .from('users')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  assert.equal(count, Number(n));
});

Then(
  'the user {string} has first name {string}',
  async function (email: string, firstName: string) {
    const { data } = await testDb()
      .from('users')
      .select('first_name')
      .eq('email', email)
      .single<{ first_name: string }>();
    assert.equal(data?.first_name, firstName);
  },
);

Then('the staff member {string} has:', async function (email: string, table: DataTable) {
  const { data, error } = await testDb()
    .from('staff_members')
    .select('role, is_active, created_by')
    .eq('email', email.toLowerCase())
    .single<{ role: string; is_active: boolean; created_by: string | null }>();
  if (error || !data) throw new Error(`no staff row for ${email}`);
  const expected = table.rowsHash();
  if (expected.role) assert.equal(data.role, expected.role);
  if (expected.active) assert.equal(data.is_active, expected.active === 'yes');
  if (expected['created by']) {
    assert.equal(
      expected['created by'] === 'nobody' ? null : 'someone',
      data.created_by ? 'someone' : null,
    );
  }
});

Then('there are {int} staff members', async function (n: number) {
  const { count } = await testDb()
    .from('staff_members')
    .select('id', { count: 'exact', head: true });
  assert.equal(count, n);
});

Then('no log entry contains a session token or Google credential', async function (this: ApiWorld) {
  await new Promise((r) => setTimeout(r, 50));
  const all = this.logs.map((l) => JSON.stringify(l)).join('\n');
  assert.ok(!/eyJ[\w-]{10,}\.[\w-]{10,}\./.test(all), 'a JWT appeared in the logs');
});

Then('no log entry contains {string} in full', async function (this: ApiWorld, email: string) {
  await new Promise((r) => setTimeout(r, 50));
  const leaked = this.logs.find((l) =>
    JSON.stringify(l).toLowerCase().includes(email.toLowerCase()),
  );
  assert.equal(leaked, undefined, `log leaked ${email}: ${JSON.stringify(leaked)}`);
});
