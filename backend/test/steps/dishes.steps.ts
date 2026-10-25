import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { testDb } from '../support/test-database';
import { ApiWorld, getPath } from '../support/world';
import { req } from './api.steps';

interface MenuJson {
  categories: Array<{ id: string; items: Array<{ name: string }> }>;
}

interface AdminDishJson {
  name: string;
  archivedAt: string | null;
}

async function publicMenu(world: ApiWorld): Promise<MenuJson> {
  // Read through the public API with its own request, so the scenario's response is kept.
  const res = await req(world, 'get', '/api/v1/menu');
  assert.equal(res.status, 200);
  return res.body as MenuJson;
}

Given('the menu item {string} is retired', async function (name: string) {
  const { error } = await testDb()
    .from('menu_items')
    .update({ archived_at: new Date().toISOString() })
    .eq('name', name);
  if (error) throw new Error(error.message);
});

When(
  'I add a {string} dish with a {int}-character {word}',
  async function (this: ApiWorld, category: string, length: number, field: string) {
    const body = { name: 'Atama', category, [field]: 'a'.repeat(length) };
    this.response = await req(this, 'post', '/api/v1/admin/menu-items')
      .set('Content-Type', 'application/json')
      .send(body);
  },
);

Then('the response lists the dishes {string}', function (this: ApiWorld, names: string) {
  const dishes = this.res().body as AdminDishJson[];
  assert.deepEqual(
    dishes.map((d) => d.name),
    names.split(',').map((n) => n.trim()),
  );
});

Then(
  /^the listed dish "([^"]+)" is (not )?retired$/,
  function (this: ApiWorld, name: string, not: string | undefined) {
    const dish = (this.res().body as AdminDishJson[]).find((d) => d.name === name);
    assert.ok(dish, `${name} is not listed`);
    assert.equal(dish.archivedAt === null, Boolean(not));
  },
);

Then('the dish {string} has:', async function (name: string, table: DataTable) {
  const { data, error } = await testDb().from('menu_items').select('*').eq('name', name);
  if (error) throw new Error(error.message);
  const row = (data as Array<Record<string, unknown>>)[0];
  assert.ok(row, `no dish named ${name}`);
  for (const [column, expected] of Object.entries(table.rowsHash())) {
    assert.equal(String(row[column]), expected, column);
  }
});

Then(
  'the menu category {string} lists, in order:',
  async function (this: ApiWorld, id: string, table: DataTable) {
    const category = (await publicMenu(this)).categories.find((c) => c.id === id);
    assert.ok(category, `no category ${id}`);
    assert.deepEqual(
      category.items.map((i) => i.name),
      table.raw().map(([name]) => name),
    );
  },
);

Then('the menu does not show {string}', async function (this: ApiWorld, name: string) {
  const names = (await publicMenu(this)).categories.flatMap((c) => c.items.map((i) => i.name));
  assert.ok(!names.includes(name), `${name} is still on the menu`);
});

Then('the response JSON at {string} is a timestamp', function (this: ApiWorld, path: string) {
  const value = getPath(this.res().body, path);
  assert.equal(typeof value, 'string');
  assert.ok(!Number.isNaN(Date.parse(value as string)), `${String(value)} is not a timestamp`);
});
