import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDb } from '../support/test-database';
import { ApiWorld, getPath } from '../support/world';
import { req } from './api.steps';
import { resolveRefs } from './options.steps';

async function menuItemId(name: string): Promise<string> {
  const { data, error } = await testDb()
    .from('menu_items')
    .select('id')
    .eq('name', name)
    .single<{ id: string }>();
  if (error || !data) throw new Error(`no menu item named ${name}`);
  return data.id;
}

async function optionId(name: string): Promise<string> {
  const { data, error } = await testDb()
    .from('options')
    .select('id')
    .eq('name', name)
    .single<{ id: string }>();
  if (error || !data) throw new Error(`no option named ${name}`);
  return data.id;
}

interface ItemInput {
  menuItemId: string;
  quantity: number;
  optionIds?: string[];
}

/** "Edikang Ikong x2, Afang Soup (Chicken + Egg) x1" → [{ menuItemId, quantity, optionIds }] */
export async function parseItems(spec: string): Promise<ItemInput[]> {
  if (!spec.trim()) return [];
  return Promise.all(
    spec.split(',').map(async (part) => {
      const match = /^\s*(.+?)(?:\s+\(([^)]*)\))?\s+x(\d+)\s*$/.exec(part);
      if (!match) throw new Error(`bad item spec: ${part}`);
      const line: ItemInput = {
        menuItemId: await menuItemId(match[1]),
        quantity: Number(match[3]),
      };
      if (match[2] !== undefined) {
        const names = match[2]
          .split('+')
          .map((n) => n.trim())
          .filter(Boolean);
        line.optionIds = await Promise.all(names.map(optionId));
      }
      return line;
    }),
  );
}

interface OrderBody {
  fulfilment: string;
  branchId: string;
  items: ItemInput[];
  contact: { fullName: string; phone: string };
  delivery?: { streetAddress: string; city?: string };
  expectedTotalKobo: number;
  clientRequestId: string;
}

/** Builds a checkout body the way the site does: quote first, then submit the total shown. */
async function buildOrder(world: ApiWorld, settings: Record<string, string>): Promise<OrderBody> {
  const fulfilment = settings.fulfilment ?? 'delivery';
  const branchId = settings.branch ?? 'calabar';
  const items = await parseItems(settings.items ?? 'Edikang Ikong x1');
  const body: OrderBody = {
    fulfilment,
    branchId,
    items,
    contact: {
      fullName: settings.name ?? 'Ekaette Bassey',
      phone: settings.phone ?? '0803 123 4567',
    },
    expectedTotalKobo: 0,
    clientRequestId: settings['request id'] ?? randomUUID(),
  };
  if (fulfilment === 'delivery' && settings.address !== '<none>') {
    body.delivery = { streetAddress: settings.address ?? '12 Marian Road, Calabar' };
    if (settings.city) body.delivery.city = settings.city;
  }
  if (fulfilment === 'pickup' && settings.address) {
    body.delivery = { streetAddress: settings.address };
  }
  if (settings['expected total']) {
    body.expectedTotalKobo = Number(settings['expected total']);
  } else {
    const quote = await req(world, 'post', '/api/v1/orders/quote').send({
      fulfilment,
      branchId,
      items,
    });
    body.expectedTotalKobo = (quote.body as { totalKobo: number | null }).totalKobo ?? 1;
  }
  return body;
}

let lastBody: OrderBody | undefined;

// ---------- given ----------

Given('the time in Calabar is {string}', function (this: ApiWorld, hhmm: string) {
  this.now = new Date(`2026-10-05T${hhmm}:00+01:00`);
});

Given('the menu item {string} is marked unavailable', async function (name: string) {
  const { error } = await testDb()
    .from('menu_items')
    .update({ is_available: false })
    .eq('name', name);
  if (error) throw new Error(error.message);
});

Given('the price of {string} changes to {int} kobo', async function (name: string, price: number) {
  const { error } = await testDb()
    .from('menu_items')
    .update({ price_kobo: price })
    .eq('name', name);
  if (error) throw new Error(error.message);
});

// ---------- when ----------

When('I ask for a quote with:', async function (this: ApiWorld, table: DataTable) {
  const s = table.rowsHash();
  this.response = await req(this, 'post', '/api/v1/orders/quote').send({
    fulfilment: s.fulfilment ?? 'delivery',
    branchId: s.branch ?? 'calabar',
    items: await parseItems(s.items ?? ''),
  });
});

function rememberOrder(world: ApiWorld): void {
  if (world.response?.status === 201)
    world.lastOrderId = (world.response.body as { id: string }).id;
}

When('I place an order', async function (this: ApiWorld) {
  lastBody = await buildOrder(this, {});
  this.response = await req(this, 'post', '/api/v1/orders').send(lastBody);
  rememberOrder(this);
});

When('I place an order with:', async function (this: ApiWorld, table: DataTable) {
  lastBody = await buildOrder(this, table.rowsHash());
  this.response = await req(this, 'post', '/api/v1/orders').send(lastBody);
  rememberOrder(this);
});

When('I prepare an order with:', async function (this: ApiWorld, table: DataTable) {
  lastBody = await buildOrder(this, table.rowsHash());
});

When('I submit the prepared order', async function (this: ApiWorld) {
  assert.ok(lastBody, 'no prepared order');
  this.response = await req(this, 'post', '/api/v1/orders').send(lastBody);
});

When('I submit the same order again', async function (this: ApiWorld) {
  assert.ok(lastBody, 'no previous order');
  this.response = await req(this, 'post', '/api/v1/orders').send(lastBody);
});

When('I submit the same order twice at the same time', async function (this: ApiWorld) {
  const body = await buildOrder(this, {});
  const [a, b] = await Promise.all([
    req(this, 'post', '/api/v1/orders').send(body),
    req(this, 'post', '/api/v1/orders').send(body),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201], `${a.text}\n${b.text}`);
  assert.equal((a.body as { id: string }).id, (b.body as { id: string }).id);
  this.response = a;
});

When('I send the order body:', async function (this: ApiWorld, body: string) {
  this.response = await req(this, 'post', '/api/v1/orders')
    .set('Content-Type', 'application/json')
    .send(await resolveRefs(body));
});

When('I fetch that order', async function (this: ApiWorld) {
  const id = (this.res().body as { id: string }).id;
  this.lastOrderId = id;
  this.response = await req(this, 'get', `/api/v1/orders/${id}`);
});

When('I fetch the order placed earlier', async function (this: ApiWorld) {
  assert.ok(this.lastOrderId, 'no earlier order');
  this.response = await req(this, 'get', `/api/v1/orders/${this.lastOrderId}`);
});

// ---------- then ----------

Then(
  'the response JSON at {string} matches {string}',
  function (this: ApiWorld, path: string, pattern: string) {
    assert.match(String(getPath(this.res().body, path)), new RegExp(pattern));
  },
);

Then('there is/are {int} order(s) in the database', async function (n: number) {
  const { count } = await testDb().from('orders').select('id', { count: 'exact', head: true });
  assert.equal(count, n);
});

Then('the stored order has:', async function (this: ApiWorld, table: DataTable) {
  const id = (this.res().body as { id: string }).id;
  this.lastOrderId = id;
  const { data, error } = await testDb()
    .from('orders')
    .select('*')
    .eq('id', id)
    .single<Record<string, unknown>>();
  if (error || !data) throw new Error(`order ${id} not in the database`);
  for (const [column, expected] of Object.entries(table.rowsHash())) {
    assert.equal(String(data[column]), expected, column);
  }
  assert.ok(
    typeof data.tracking_token === 'string' && data.tracking_token.length >= 43,
    'tracking token should be long and random',
  );
  assert.equal(data.table_id, null);
});

Then(
  'an audit event {string} with outcome {string} is recorded',
  async function (this: ApiWorld, event: string, outcome: string) {
    // Some audit records (e.g. the email's) are written just after the visible effect,
    // so allow a short wait before deciding the event is missing.
    let data: Array<NonNullable<ApiWorld['lastAudit']>> | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      ({ data } = await testDb()
        .from('audit_events')
        .select('event, outcome, error_code, correlation_id')
        .eq('event', event)
        .eq('outcome', outcome));
      if (data && data.length > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(data && data.length > 0, `no ${outcome} ${event} audit event`);
    this.lastAudit = data[0];
  },
);

Then('that audit event has error code {string}', function (this: ApiWorld, code: string) {
  assert.equal(this.lastAudit?.error_code, code);
});

Then('that audit event carries the request id', function (this: ApiWorld) {
  assert.equal(this.lastAudit?.correlation_id, this.res().headers['x-request-id']);
});

Then('the response does not reveal the tracking token', function (this: ApiWorld) {
  assert.ok(!this.res().text.includes('tracking'), 'tracking token leaked');
});
