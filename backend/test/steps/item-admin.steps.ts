import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ApiWorld } from '../support/world';
import { req } from './api.steps';

interface MenuJson {
  categories: Array<{ items: Array<{ name: string; isAvailable: boolean }> }>;
}

Then(
  /^the menu shows "([^"]+)" as (available|unavailable)$/,
  async function (this: ApiWorld, name: string, state: string) {
    // Read through the public API with its own request, so the scenario's response is kept.
    const res = await req(this, 'get', '/api/v1/menu');
    assert.equal(res.status, 200);
    const item = (res.body as MenuJson).categories
      .flatMap((c) => c.items)
      .find((i) => i.name === name);
    assert.ok(item, `${name} is not on the menu`);
    assert.equal(item.isAvailable, state === 'available');
  },
);
