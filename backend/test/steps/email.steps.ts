import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { EmailDispatcher } from '../../src/mail/email-dispatcher';
import { MAIL_PROVIDER } from '../../src/mail/mail-provider';
import type { InMemoryMailProvider } from '../../src/mail/providers/in-memory.provider';
import { testDb } from '../support/test-database';
import type { ApiWorld } from '../support/world';

function mailbox(world: ApiWorld): InMemoryMailProvider {
  assert.ok(world.app);
  return world.app.get<InMemoryMailProvider>(MAIL_PROVIDER);
}

async function eventually<T>(
  fn: () => T | Promise<T>,
  ok: (v: T) => boolean,
  ms = 3000,
): Promise<T> {
  const until = Date.now() + ms;
  let value = await fn();
  while (!ok(value) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 25));
    value = await fn();
  }
  return value;
}

async function outboxRow(world: ApiWorld) {
  const { data } = await testDb()
    .from('email_outbox')
    .select('status, attempts, last_error, provider_message_id, next_attempt_at')
    .eq('order_id', world.lastOrderId)
    .maybeSingle<{
      status: string;
      attempts: number;
      last_error: string | null;
      provider_message_id: string | null;
      next_attempt_at: string;
    }>();
  return data;
}

Given('the mail provider fails the next {int} send(s)', function (this: ApiWorld, n: number) {
  mailbox(this).failNext(n);
});

When('the email dispatcher runs', async function (this: ApiWorld) {
  assert.ok(this.app);
  await this.app.get(EmailDispatcher).runOnce();
});

Then('a confirmation email is sent to {string}', async function (this: ApiWorld, to: string) {
  const sent = await eventually(
    () => mailbox(this).sent,
    (s) => s.length > 0,
  );
  assert.equal(sent.length, 1, `expected 1 email, got ${sent.length}`);
  assert.equal(sent[0]?.to, to);
});

Then(
  'exactly {int} confirmation email(s) has/have been sent',
  async function (this: ApiWorld, n: number) {
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(mailbox(this).sent.length, n);
  },
);

Then('no confirmation email is queued or sent', async function (this: ApiWorld) {
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(mailbox(this).sent.length, 0);
  assert.equal(await outboxRow(this), null);
});

Then('the email has:', function (this: ApiWorld, table: DataTable) {
  const email = mailbox(this).sent[0];
  assert.ok(email, 'no email sent');
  for (const [field, expected] of Object.entries(table.rowsHash())) {
    if (field === 'subject') assert.equal(email.subject, expected);
    else if (field === 'subject matches') assert.match(email.subject, new RegExp(`^${expected}$`));
    else if (field === 'from') assert.equal(email.from, expected);
    else if (field === 'text contains')
      assert.ok(email.text.includes(expected), `text lacks "${expected}"`);
    else if (field === 'html contains')
      assert.ok(email.html.includes(expected), `html lacks "${expected}"`);
    else throw new Error(`unknown field ${field}`);
  }
});

Then('the email links to the tracking page with the order token', async function (this: ApiWorld) {
  const { data } = await testDb()
    .from('orders')
    .select('tracking_token')
    .eq('id', this.lastOrderId)
    .single<{ tracking_token: string }>();
  const email = mailbox(this).sent[0];
  assert.ok(email?.html.includes(`href="http://localhost:5173/track/${data?.tracking_token}"`));
});

Then(
  'the confirmation email is recorded as {string} after {int} attempt(s)',
  async function (this: ApiWorld, status: string, attempts: number) {
    // A new row is already "pending" with 0 attempts, so wait for the attempt count too.
    const row = await eventually(
      () => outboxRow(this),
      (r) => r?.status === status && r.attempts === attempts,
    );
    assert.equal(row?.status, status, JSON.stringify(row));
    assert.equal(row?.attempts, attempts);
    if (status === 'sent') assert.ok(row?.provider_message_id);
    else assert.ok(row?.last_error);
  },
);

Then(
  'the next email attempt is scheduled {int} minute(s) later',
  async function (this: ApiWorld, minutes: number) {
    const row = await outboxRow(this);
    assert.ok(row && this.now);
    assert.equal(new Date(row.next_attempt_at).getTime() - this.now.getTime(), minutes * 60_000);
  },
);

Then(
  'the order has an estimated time {int} minutes after payment',
  async function (this: ApiWorld, minutes: number) {
    const { data } = await testDb()
      .from('orders')
      .select('estimated_ready_at')
      .eq('id', this.lastOrderId)
      .single<{ estimated_ready_at: string }>();
    assert.ok(this.now);
    assert.equal(
      new Date(data?.estimated_ready_at ?? 0).getTime() - this.now.getTime(),
      minutes * 60_000,
    );
  },
);
