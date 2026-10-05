import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ApiWorld, DEFAULT_ENV } from '../support/world';
import { req } from './api.steps';
import { signIn } from './auth.steps';
import { parseItems } from './orders.steps';

interface CartJson {
  lines: Array<{
    id: string;
    menuItemId: string;
    optionIds: string[];
    name: string;
    options: Array<{ name: string }>;
    quantity: number;
    unitPriceKobo: number | null;
    problems: Array<{ code: string }>;
    priceChange: { fromKobo: number; toKobo: number } | null;
  }>;
  itemCount: number;
  subtotalKobo: number | null;
  canCheckout: boolean;
}

type Devices = Record<string, string | undefined>;
const devices = (world: ApiWorld): Devices => {
  const w = world as ApiWorld & { devices?: Devices };
  w.devices ??= {};
  return w.devices;
};

async function one(spec: string) {
  const [line] = await parseItems(spec);
  return line;
}

const label = (l: CartJson['lines'][number]) =>
  l.options.length ? `${l.name} (${l.options.map((o) => o.name).join(' + ')})` : l.name;

// ---------- devices (two clients, one account) ----------

Given(
  /^I am signed in as "([^"]+)" on my (laptop|phone)$/,
  async function (this: ApiWorld, email: string, device: string) {
    if (!this.app) await this.start(DEFAULT_ENV);
    await signIn(this, { email });
    devices(this)[device] = this.sessionCookie;
  },
);

When(/^on my (laptop|phone)$/, function (this: ApiWorld, device: string) {
  const cookie = devices(this)[device];
  assert.ok(cookie, `not signed in on the ${device}`);
  this.sessionCookie = cookie;
});

// ---------- cart actions ----------

When('I set {string} in my cart', async function (this: ApiWorld, spec: string) {
  this.response = await req(this, 'put', '/api/v1/cart/lines').send(await one(spec));
});

When('I send the cart line:', async function (this: ApiWorld, body: string) {
  this.response = await req(this, 'put', '/api/v1/cart/lines')
    .set('Content-Type', 'application/json')
    .send(body);
});

When('I look at my cart', async function (this: ApiWorld) {
  this.response = await req(this, 'get', '/api/v1/cart');
});

When('I remove {string} from my cart', async function (this: ApiWorld, wanted: string) {
  const cart = (await req(this, 'get', '/api/v1/cart')).body as CartJson;
  const line = cart.lines.find((l) => label(l) === wanted);
  assert.ok(line, `${wanted} is not in the cart`);
  this.response = await req(this, 'delete', `/api/v1/cart/lines/${line.id}`);
});

When('I empty my cart', async function (this: ApiWorld) {
  this.response = await req(this, 'delete', '/api/v1/cart');
});

When('I merge my guest cart:', async function (this: ApiWorld, table: DataTable) {
  const lines = await Promise.all(table.raw().map(([spec]) => one(spec)));
  this.response = await req(this, 'post', '/api/v1/cart/merge').send({ lines });
});

/** Checks out exactly what is in the cart, the way the site and app do. */
When('I check out my cart for pickup', async function (this: ApiWorld) {
  const cart = (await req(this, 'get', '/api/v1/cart')).body as CartJson;
  const items = cart.lines.map((l) => ({
    menuItemId: l.menuItemId,
    quantity: l.quantity,
    optionIds: l.optionIds,
  }));
  const quote = await req(this, 'post', '/api/v1/orders/quote').send({
    fulfilment: 'pickup',
    branchId: 'calabar',
    items,
  });
  this.response = await req(this, 'post', '/api/v1/orders').send({
    fulfilment: 'pickup',
    branchId: 'calabar',
    items,
    contact: { fullName: 'Ekaette Bassey', phone: '0803 123 4567' },
    expectedTotalKobo: (quote.body as { totalKobo: number }).totalKobo,
    clientRequestId: crypto.randomUUID(),
  });
  assert.equal(this.response.status, 201, this.response.text);
  this.lastOrderId = (this.response.body as { id: string }).id;
});

// ---------- assertions ----------

Then('my cart has:', async function (this: ApiWorld, table: DataTable) {
  const cart = (await req(this, 'get', '/api/v1/cart')).body as CartJson;
  const columns = table.raw()[0];
  const actual = cart.lines.map((l) => {
    const row: Record<string, string> = {
      item: label(l),
      quantity: String(l.quantity),
      'unit price': l.unitPriceKobo === null ? '' : String(l.unitPriceKobo),
      problems: l.problems.map((p) => p.code).join(', '),
      'price change': l.priceChange ? `${l.priceChange.fromKobo} -> ${l.priceChange.toKobo}` : '',
    };
    return Object.fromEntries(columns.map((c) => [c, row[c]]));
  });
  assert.deepEqual(actual, table.hashes());
});

Then('my cart is empty', async function (this: ApiWorld) {
  const cart = (await req(this, 'get', '/api/v1/cart')).body as CartJson;
  assert.deepEqual(cart.lines, []);
});

Then(/^my cart (can|cannot) be checked out$/, async function (this: ApiWorld, can: string) {
  const cart = (await req(this, 'get', '/api/v1/cart')).body as CartJson;
  assert.equal(cart.canCheckout, can === 'can');
});

Then('the cart response skipped {int} line(s)', function (this: ApiWorld, n: number) {
  assert.equal((this.res().body as { skipped: number }).skipped, n);
});

When('I DELETE the cart line {string}', async function (this: ApiWorld, id: string) {
  this.response = await req(this, 'delete', `/api/v1/cart/lines/${id}`);
});
