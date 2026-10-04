import { Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { testDb } from '../support/test-database';
import { ApiWorld } from '../support/world';
import { req } from './api.steps';

async function track(world: ApiWorld, token: string): Promise<void> {
  world.response = await req(world, 'get', `/api/v1/orders/track/${encodeURIComponent(token)}`);
}

When('I track my order with the link from the email', async function (this: ApiWorld) {
  if (!this.lastOrderId) this.lastOrderId = (this.res().body as { id: string }).id;
  const { data, error } = await testDb()
    .from('orders')
    .select('tracking_token')
    .eq('id', this.lastOrderId)
    .single<{ tracking_token: string }>();
  if (error || !data) throw new Error(`order ${this.lastOrderId} not in the database`);
  this.trackingToken = data.tracking_token;
  await track(this, data.tracking_token);
});

When('I track an order with an unknown token', async function (this: ApiWorld) {
  this.trackingToken = randomBytes(32).toString('base64url');
  await track(this, this.trackingToken);
});

When('I track an order with the token {string}', async function (this: ApiWorld, token: string) {
  this.trackingToken = token;
  await track(this, token);
});

When(
  /^I try to track my order by its (id|order number)$/,
  async function (this: ApiWorld, what: string) {
    if (!this.lastOrderId) this.lastOrderId = (this.res().body as { id: string }).id;
    const { data } = await testDb()
      .from('orders')
      .select('order_number')
      .eq('id', this.lastOrderId)
      .single<{ order_number: number }>();
    await track(this, what === 'id' ? this.lastOrderId : String(data?.order_number));
  },
);

Then('no log entry contains the tracking token', async function (this: ApiWorld) {
  assert.ok(this.trackingToken, 'no tracking token used');
  await new Promise((r) => setTimeout(r, 50));
  const token = this.trackingToken;
  const leaked = this.logs.find((l) => JSON.stringify(l).includes(token));
  assert.equal(leaked, undefined, `log leaked the tracking token: ${JSON.stringify(leaked)}`);
});
