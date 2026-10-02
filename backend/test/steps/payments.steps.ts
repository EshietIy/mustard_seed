import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { PaymentExpirySweeper } from '../../src/payments/payment-expiry.sweeper';
import { testDb } from '../support/test-database';
import { ApiWorld, DEFAULT_ENV } from '../support/world';
import { req } from './api.steps';

const CONTROL_KEY = DEFAULT_ENV.SIMULATOR_CONTROL_KEY;

function simUrl(world: ApiWorld, path: string): string {
  return `http://127.0.0.1:${world.port}/simulator/paystack${path}`;
}

async function control(
  world: ApiWorld,
  path: string,
  body: unknown = {},
  key: string | null = CONTROL_KEY,
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key) headers['x-simulator-control-key'] = key;
  const res = await fetch(simUrl(world, `/_control${path}`), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  world.lastControl = { status: res.status, body: await res.json().catch(() => null) };
  return world.lastControl;
}

function reference(world: ApiWorld): string {
  assert.ok(world.payment, 'no payment started');
  return world.payment.reference;
}

async function orderRow(world: ApiWorld) {
  assert.ok(world.lastOrderId, 'no order');
  const { data } = await testDb()
    .from('orders')
    .select('status, total_kobo')
    .eq('id', world.lastOrderId)
    .single<{ status: string; total_kobo: number }>();
  return data;
}

// ---------- starting payment ----------

When('I start paying for my order', async function (this: ApiWorld) {
  if (!this.lastOrderId) this.lastOrderId = (this.res().body as { id: string }).id;
  this.response = await req(this, 'post', `/api/v1/orders/${this.lastOrderId}/payments`);
  if (this.response.status === 201) {
    this.payment = this.response.body as { reference: string; authorizationUrl: string };
  }
});

When('I start paying for the order placed earlier', async function (this: ApiWorld) {
  assert.ok(this.lastOrderId);
  this.response = await req(this, 'post', `/api/v1/orders/${this.lastOrderId}/payments`);
});

Given('I have placed an order and started paying', async function (this: ApiWorld) {
  const items = await testDb()
    .from('menu_items')
    .select('id')
    .eq('name', 'Zobo')
    .single<{ id: string }>();
  assert.ok(items.data, 'Background must include Zobo');
  const quote = await req(this, 'post', '/api/v1/orders/quote').send({
    fulfilment: 'pickup',
    branchId: 'calabar',
    items: [{ menuItemId: items.data.id, quantity: 2 }],
  });
  const placed = await req(this, 'post', '/api/v1/orders').send({
    fulfilment: 'pickup',
    branchId: 'calabar',
    items: [{ menuItemId: items.data.id, quantity: 2 }],
    contact: { fullName: 'Ekaette Bassey', phone: '0803 123 4567' },
    expectedTotalKobo: (quote.body as { totalKobo: number }).totalKobo,
    clientRequestId: crypto.randomUUID(),
  });
  assert.equal(placed.status, 201, placed.text);
  this.lastOrderId = (placed.body as { id: string }).id;
  this.response = await req(this, 'post', `/api/v1/orders/${this.lastOrderId}/payments`);
  assert.equal(this.response.status, 201, this.response.text);
  this.payment = this.response.body as { reference: string; authorizationUrl: string };
});

// ---------- the hosted TEST PAYMENT page ----------

const OUTCOMES: Record<string, string> = {
  'pay successfully': 'success',
  'decline the card': 'failed',
  cancel: 'abandoned',
  'leave the payment pending': 'ongoing',
};

When(
  /^I (pay successfully|decline the card|cancel|leave the payment pending) on the test payment page$/,
  async function (this: ApiWorld, action: string) {
    assert.ok(this.payment);
    const page = await fetch(this.payment.authorizationUrl);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes('TEST PAYMENT: no real money is charged'), 'not the test payment page');
    const res = await fetch(this.payment.authorizationUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `outcome=${OUTCOMES[action]}`,
      redirect: 'manual',
    });
    this.lastControl = { status: res.status, body: res.headers.get('location') };
  },
);

Then('I am sent back to the site with the payment reference', function (this: ApiWorld) {
  assert.equal(this.lastControl?.status, 303);
  const location = String(this.lastControl?.body);
  const ref = encodeURIComponent(reference(this));
  assert.equal(
    location,
    `http://localhost:5173/orders/${this.lastOrderId}?reference=${ref}&trxref=${ref}`,
  );
});

Then(
  'the test payment page shows the amount {string}',
  async function (this: ApiWorld, amount: string) {
    assert.ok(this.payment);
    const res = await fetch(this.payment.authorizationUrl);
    const html = await res.text();
    assert.ok(html.includes(amount), `amount ${amount} not on the page`);
    assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  },
);

When('I return from the payment page', async function (this: ApiWorld) {
  this.response = await req(this, 'post', '/api/v1/payments/verify').send({
    reference: reference(this),
  });
});

When('I verify the payment reference {string}', async function (this: ApiWorld, ref: string) {
  this.response = await req(this, 'post', '/api/v1/payments/verify').send({ reference: ref });
});

// ---------- simulator controls ----------

When(
  'the payment gateway reports the payment as {string}',
  async function (this: ApiWorld, status: string) {
    const res = await control(
      this,
      `/transactions/${encodeURIComponent(reference(this))}/outcome`,
      { status, webhook: false },
    );
    assert.equal(res.status, 200, JSON.stringify(res.body));
  },
);

When('the customer completes the payment late', async function (this: ApiWorld) {
  const res = await control(this, `/transactions/${encodeURIComponent(reference(this))}/outcome`, {
    status: 'success',
  });
  assert.equal(res.status, 200);
});

async function sendWebhook(world: ApiWorld, body: Record<string, unknown>): Promise<void> {
  await control(world, `/transactions/${encodeURIComponent(reference(world))}/webhook`, body);
}

When('the simulator sends the webhook {int} times', async function (this: ApiWorld, times: number) {
  await sendWebhook(this, { times });
});

When('the simulator sends the webhook with a bad signature', async function (this: ApiWorld) {
  await sendWebhook(this, { signature: 'invalid' });
});

When('the simulator sends the webhook with no signature', async function (this: ApiWorld) {
  await sendWebhook(this, { signature: 'missing' });
});

When(
  'the simulator sends the webhook with the amount {int}',
  async function (this: ApiWorld, amountKobo: number) {
    await sendWebhook(this, { amountKobo });
  },
);

Then('the webhook deliveries were answered with:', function (this: ApiWorld, table: DataTable) {
  const deliveries = (this.lastControl?.body as { deliveries: number[] }).deliveries;
  assert.deepEqual(
    deliveries,
    table.raw().map((r) => Number(r[0])),
  );
});

Given(
  'the payment gateway fails the next request with {int}',
  async function (this: ApiWorld, status: number) {
    await control(this, '/fail-next', { status, count: 1 });
  },
);

Given(
  'the payment gateway takes {int} ms to answer',
  async function (this: ApiWorld, delayMs: number) {
    await control(this, '/fail-next', { status: 0, count: 1, delayMs });
  },
);

When(
  'I call the simulator control API with key {string}',
  async function (this: ApiWorld, key: string) {
    await control(this, '/reset', {}, key === '<none>' ? null : key);
  },
);

Then('the simulator control API answers {int}', function (this: ApiWorld, status: number) {
  assert.equal(this.lastControl?.status, status);
});

When(
  'I call the simulator API with the bearer key {string}',
  async function (this: ApiWorld, key: string) {
    const res = await fetch(simUrl(this, '/transaction/initialize'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ email: 'a@b.co', amount: 100 }),
    });
    this.lastControl = { status: res.status, body: await res.json() };
  },
);

When('I initialize a simulator transaction with:', async function (this: ApiWorld, body: string) {
  const res = await fetch(simUrl(this, '/transaction/initialize'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${DEFAULT_ENV.PAYSTACK_SECRET_KEY}`,
    },
    body,
  });
  this.lastControl = { status: res.status, body: await res.json() };
});

Then(
  'the simulator answers {int} with message {string}',
  function (this: ApiWorld, status: number, message: string) {
    assert.equal(this.lastControl?.status, status);
    assert.deepEqual(this.lastControl?.body, { status: false, message });
  },
);

// ---------- time and expiry ----------

Given('{int} minutes pass', function (this: ApiWorld, minutes: number) {
  this.now = new Date((this.now ?? new Date()).getTime() + minutes * 60_000);
});

When('the payment expiry sweep runs', async function (this: ApiWorld) {
  assert.ok(this.app);
  await this.app.get(PaymentExpirySweeper).runOnce();
});

// ---------- assertions ----------

Then('my order status is {string}', async function (this: ApiWorld, status: string) {
  assert.equal((await orderRow(this))?.status, status);
});

Then('the payment status is {string}', async function (this: ApiWorld, status: string) {
  const { data } = await testDb()
    .from('payments')
    .select('status, channel, paid_at')
    .eq('reference', reference(this))
    .single<{ status: string }>();
  assert.equal(data?.status, status);
});

Then('there is exactly one payment for my order', async function (this: ApiWorld) {
  const { count } = await testDb()
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', this.lastOrderId);
  assert.equal(count, 1);
});

Then(
  'the audit trail has {int} {string} event(s) for my order',
  async function (this: ApiWorld, n: number, event: string) {
    const { count } = await testDb()
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', this.lastOrderId as string)
      .eq('event', event);
    assert.equal(count, n);
  },
);

Then('the response gives the same payment link as before', function (this: ApiWorld) {
  assert.deepEqual(this.res().body, this.payment);
});
