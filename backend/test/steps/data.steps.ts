import { DataTable, Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { testDb } from '../support/test-database';
import { ApiWorld, DEFAULT_ENV, getPath } from '../support/world';

const yes = (v: string | undefined): boolean => v?.trim().toLowerCase() === 'yes';

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ---------- data setup ----------

Given('the menu contains:', async function (table: DataTable) {
  const rows = table.hashes().map((r, i) => ({
    slug: slugify(r.name ?? `item-${i}`),
    name: r.name,
    description: r.description ?? '',
    category: r.category,
    price_kobo: r.price ? Number(r.price) : null,
    is_house_signature: yes(r['house signature']),
    is_fresh_juice: yes(r['fresh juice']),
    is_available: r.available === undefined ? true : yes(r.available),
    image_path: r.image ? r.image : null,
    sort_order: r['sort order'] ? Number(r['sort order']) : (i + 1) * 10,
  }));
  const { error } = await testDb().from('menu_items').insert(rows);
  if (error) throw new Error(error.message);
});

Given('the menu is empty', function () {
  // Every scenario starts from an empty menu (see the Before hook).
});

Given('the restaurant settings row is missing', async function () {
  const { error } = await testDb().from('restaurant_info').delete().eq('id', true);
  if (error) throw new Error(error.message);
});

Given('the Calabar street address is {string}', async function (address: string) {
  const { error } = await testDb()
    .from('branches')
    .update({ street_address: address })
    .eq('id', 'calabar');
  if (error) throw new Error(error.message);
});

Given('the phone number is {string}', async function (phone: string) {
  const { error } = await testDb()
    .from('restaurant_info')
    .update({ phone_whatsapp: phone })
    .eq('id', true);
  if (error) throw new Error(error.message);
});

Given('the database is unreachable', async function (this: ApiWorld) {
  // Port 9 (discard) refuses connections: a fast, deterministic upstream failure.
  // Keep any session: the cookie stays valid (same JWT secret) across the restart.
  const session = this.sessionCookie;
  await this.start({ ...DEFAULT_ENV, SUPABASE_URL: 'http://127.0.0.1:9' });
  this.sessionCookie = session;
});

// ---------- menu assertions ----------

interface ItemJson {
  name: string;
  [k: string]: unknown;
}
interface CategoryJson {
  id: string;
  label: string;
  items: ItemJson[];
}

function categories(world: ApiWorld): CategoryJson[] {
  return (world.res().body as { categories: CategoryJson[] }).categories;
}

function findItem(world: ApiWorld, name: string): ItemJson {
  const item = categories(world)
    .flatMap((c) => c.items)
    .find((i) => i.name === name);
  assert.ok(item, `item "${name}" not in the menu`);
  return item;
}

Then('the menu categories are, in order:', function (this: ApiWorld, table: DataTable) {
  assert.deepEqual(
    categories(this).map((c) => [c.id, c.label]),
    table.raw(),
  );
});

Then(
  'the category {string} lists, in order:',
  function (this: ApiWorld, id: string, table: DataTable) {
    const category = categories(this).find((c) => c.id === id);
    assert.ok(category, `no category ${id}`);
    assert.deepEqual(
      category.items.map((i) => i.name),
      table.raw().map((r) => r[0]),
    );
  },
);

Then('the category {string} has no items', function (this: ApiWorld, id: string) {
  const category = categories(this).find((c) => c.id === id);
  assert.ok(category, `no category ${id}`);
  assert.deepEqual(category.items, []);
});

Then('the item {string} has:', function (this: ApiWorld, name: string, table: DataTable) {
  const item = findItem(this, name);
  for (const [path, expected] of Object.entries(table.rowsHash())) {
    assert.equal(JSON.stringify(getPath(item, path)), expected, `${name}.${path}`);
  }
});

Then(
  'the item {string} has exactly the fields:',
  function (this: ApiWorld, name: string, table: DataTable) {
    assert.deepEqual(
      Object.keys(findItem(this, name)).sort(),
      table
        .raw()
        .map((r) => r[0])
        .sort(),
    );
  },
);

Then(
  'the item {string} image URLs start with the Supabase public URL for {string}',
  function (this: ApiWorld, name: string, key: string) {
    const image = findItem(this, name).image as { thumbnailUrl: string; fullUrl: string };
    const prefix = `${DEFAULT_ENV.SUPABASE_URL}/storage/v1/object/public/site-images/${key}`;
    assert.equal(image.thumbnailUrl, `${prefix}/thumb.webp`);
    assert.equal(image.fullUrl, `${prefix}/full.webp`);
  },
);

Then(
  'the response JSON at {string} is JSON:',
  function (this: ApiWorld, path: string, expected: string) {
    assert.deepEqual(getPath(this.res().body, path), JSON.parse(expected));
  },
);
