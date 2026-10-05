import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { testDb } from '../support/test-database';
import { ApiWorld } from '../support/world';
import { req } from './api.steps';

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function idOf(table: string, name: string): Promise<string> {
  const rows = await must<Array<{ id: string }> | null>(
    testDb().from(table).select('id').eq('name', name),
  );
  const row = rows?.[0];
  if (!row) throw new Error(`no ${table} row named ${name}`);
  return row.id;
}

// ---------- data setup ----------

/**
 * Given the option group "Soup protein" (choose 1 to 1) with options:
 *   | name    | price | available |
 */
Given(
  /^the option group "([^"]+)" \(choose (\d+) to (\d+)\) with options:$/,
  async function (name: string, min: string, max: string, table: DataTable) {
    const [group] = (await must(
      testDb()
        .from('option_groups')
        .insert({ name, min_choices: Number(min), max_choices: Number(max) })
        .select('id'),
    )) as Array<{ id: string }>;
    const rows = table.hashes().map((r, i) => ({
      group_id: group.id,
      name: r.name,
      price_delta_kobo: r.price ? Number(r.price) : 0,
      is_available: r.available === undefined ? true : r.available === 'yes',
      sort_order: (i + 1) * 10,
    }));
    await must(testDb().from('options').insert(rows));
  },
);

Given(/^"([^"]+)" offers the "([^"]+)" options$/, async function (item: string, group: string) {
  await must(
    testDb()
      .from('menu_item_option_groups')
      .insert({
        menu_item_id: await idOf('menu_items', item),
        group_id: await idOf('option_groups', group),
      }),
  );
});

Given(/^"([^"]+)" does not offer "([^"]+)"$/, async function (item: string, option: string) {
  await must(
    testDb()
      .from('menu_item_option_overrides')
      .insert({
        menu_item_id: await idOf('menu_items', item),
        option_id: await idOf('options', option),
        is_excluded: true,
      }),
  );
});

Given(
  /^"([^"]+)" costs (\d+) kobo extra on "([^"]+)"$/,
  async function (option: string, kobo: string, item: string) {
    await must(
      testDb()
        .from('menu_item_option_overrides')
        .insert({
          menu_item_id: await idOf('menu_items', item),
          option_id: await idOf('options', option),
          price_delta_kobo: Number(kobo),
        }),
    );
  },
);

Given('the menu is as above', function () {
  // Nothing extra: the Background already set up the menu and options.
});

Given(/^the option "([^"]+)" is switched off$/, async function (name: string) {
  await must(testDb().from('options').update({ is_available: false }).eq('name', name));
});

Given(/^the option "([^"]+)" is archived$/, async function (name: string) {
  await must(
    testDb().from('options').update({ archived_at: new Date().toISOString() }).eq('name', name),
  );
});

When(
  /^the option "([^"]+)" is renamed "([^"]+)" and costs (\d+) kobo extra$/,
  async function (name: string, newName: string, kobo: string) {
    await must(
      testDb()
        .from('options')
        .update({ name: newName, price_delta_kobo: Number(kobo) })
        .eq('name', name),
    );
  },
);

// ---------- menu ----------

interface GroupJson {
  name: string;
  minChoices: number;
  maxChoices: number;
  options: Array<{ name: string; priceDeltaKobo: number; isAvailable: boolean }>;
}

async function menuGroups(world: ApiWorld, item: string): Promise<GroupJson[]> {
  world.response = await req(world, 'get', '/api/v1/menu');
  const items = (
    world.res().body as {
      categories: Array<{ items: Array<{ name: string; optionGroups: GroupJson[] }> }>;
    }
  ).categories.flatMap((c) => c.items);
  const found = items.find((i) => i.name === item);
  assert.ok(found, `${item} not on the menu`);
  return found.optionGroups;
}

Then(
  /^the menu offers these choices on "([^"]+)":$/,
  async function (this: ApiWorld, item: string, table: DataTable) {
    const groups = await menuGroups(this, item);
    const actual = groups.flatMap((g) =>
      g.options.map((o) => ({
        group: g.name,
        choose: `${g.minChoices} to ${g.maxChoices}`,
        name: o.name,
        price: String(o.priceDeltaKobo),
        available: o.isAvailable ? 'yes' : 'no',
      })),
    );
    assert.deepEqual(actual, table.hashes());
  },
);

Then(/^the menu offers no choices on "([^"]+)"$/, async function (this: ApiWorld, item: string) {
  assert.deepEqual(await menuGroups(this, item), []);
});

// ---------- orders ----------

interface LineJson {
  name: string;
  quantity: number;
  unitPriceKobo: number;
  options: Array<{ groupName: string; name: string; priceDeltaKobo: number }>;
}

Then(/^the order lines are:$/, function (this: ApiWorld, table: DataTable) {
  const lines = (this.res().body as { items: LineJson[] }).items;
  assert.deepEqual(
    lines.map((l) => ({
      item: l.name,
      quantity: String(l.quantity),
      'unit price': String(l.unitPriceKobo),
      choices: l.options.map((o) => o.name).join(' + '),
    })),
    table.hashes(),
  );
});

Then(
  /^the option problem is "([^"]+)" on line (\d+)(?: for the "([^"]+)" group)?$/,
  async function (this: ApiWorld, code: string, line: string, group?: string) {
    const details = (this.res().body as { error: { details: Array<Record<string, unknown>> } })
      .error.details;
    const problem = details.find((d) => d.code === code);
    assert.ok(problem, `no ${code} in ${JSON.stringify(details)}`);
    assert.equal(problem.lineIndex, Number(line) - 1);
    if (group) assert.equal(problem.groupId, await idOf('option_groups', group));
  },
);

// ---------- staff management (admin API) ----------

const TABLES: Record<string, string> = {
  item: 'menu_items',
  option: 'options',
  group: 'option_groups',
};

/** Replaces {{item:Name}}, {{option:Name}} and {{group:Name}} with the row's id. */
export async function resolveRefs(text: string): Promise<string> {
  let out = text;
  for (const [ref, kind, name] of text.matchAll(/\{\{(item|option|group):([^}]+)\}\}/g)) {
    out = out.replace(ref, await idOf(TABLES[kind], name));
  }
  return out;
}

When(
  /^I (GET|DELETE) the admin path "([^"]+)"$/,
  async function (this: ApiWorld, method: string, path: string) {
    const url = `/api/v1/admin${await resolveRefs(path)}`;
    this.response = await req(this, method === 'GET' ? 'get' : 'delete', url);
  },
);

When(
  /^I (POST|PATCH|PUT) the admin path "([^"]+)" with JSON:$/,
  async function (this: ApiWorld, method: string, path: string, body: string) {
    const url = `/api/v1/admin${await resolveRefs(path)}`;
    const verb = method.toLowerCase() as 'post' | 'patch' | 'put';
    this.response = await req(this, verb, url)
      .set('Content-Type', 'application/json')
      .send(await resolveRefs(body));
  },
);

Then(/^the option "([^"]+)" (?:has|still has):$/, async function (name: string, table: DataTable) {
  const rows = await must<Array<Record<string, unknown>> | null>(
    testDb().from('options').select('*').eq('name', name),
  );
  const row = rows?.[0];
  assert.ok(row, `no option named ${name}`);
  for (const [column, expected] of Object.entries(table.rowsHash())) {
    assert.equal(String(row[column]), expected, column);
  }
});

Then(/^the response lists the option groups "([^"]+)"$/, function (this: ApiWorld, names: string) {
  const groups = this.res().body as Array<{ name: string }>;
  assert.deepEqual(
    groups.map((g) => g.name),
    names.split(',').map((n) => n.trim()),
  );
});
