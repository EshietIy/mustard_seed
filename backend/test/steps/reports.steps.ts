import { DataTable, Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDb } from '../support/test-database';
import { ApiWorld, getPath } from '../support/world';

/** "2026-10-20 13:15" in Calabar (WAT, UTC+1) as an ISO instant. */
const watIso = (wat: string) => new Date(`${wat.replace(' ', 'T')}:00+01:00`).toISOString();

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

/** One buyer for every seeded order; the reports never look at who bought. */
async function buyerId(): Promise<string> {
  const rows = await must(
    testDb()
      .from('users')
      .upsert(
        { google_sub: 'report-buyer', email: 'buyer@example.com' },
        { onConflict: 'google_sub' },
      )
      .select('id'),
  );
  return (rows as Array<{ id: string }>)[0].id;
}

async function insertOrder(status: string, placedAt: string, fulfilment: string, subtotal: number) {
  const fee = fulfilment === 'delivery' ? 150000 : 0;
  const rows = await must(
    testDb()
      .from('orders')
      .insert({
        tracking_token: randomBytes(32).toString('base64url'),
        user_id: await buyerId(),
        client_request_id: randomUUID(),
        status,
        fulfilment,
        branch_id: 'calabar',
        contact_full_name: 'Ekaette Bassey',
        contact_phone: '+2348012345678',
        delivery_street_address: fulfilment === 'delivery' ? '1 Test Street' : null,
        delivery_city: fulfilment === 'delivery' ? 'Calabar' : null,
        subtotal_kobo: subtotal,
        delivery_fee_kobo: fee,
        total_kobo: subtotal + fee,
        payment_expires_at: new Date(Date.parse(placedAt) + 15 * 60_000).toISOString(),
        created_at: placedAt,
      })
      .select('id'),
  );
  return { id: (rows as Array<{ id: string }>)[0].id, total: subtotal + fee };
}

const LINE = /^(.+?) x(\d+)(?: \((.+?): (.+?) \+(\d+)\))?$/;

/**
 * Given these orders were paid:
 *   | paid at          | fulfilment | items                                             |
 *   | 2026-10-20 13:15 | delivery   | Afang Soup x2 (Soup protein: Beef +50000), Zobo x1 |
 * Unit price = the dish's price + the option's price difference (kobo).
 */
Given('these orders were paid:', async function (table: DataTable) {
  const menu = await must(testDb().from('menu_items').select('id, name, price_kobo'));
  const byName = new Map(
    (menu as Array<{ id: string; name: string; price_kobo: number }>).map((m) => [m.name, m]),
  );
  for (const row of table.hashes()) {
    const paidAt = watIso(row['paid at']);
    const lines = row.items.split(',').map((text, position) => {
      const m = LINE.exec(text.trim());
      if (!m) throw new Error(`cannot read the order line "${text}"`);
      const [, name, qty, groupName, optionName, delta] = m;
      const dish = byName.get(name);
      if (!dish) throw new Error(`no dish named ${name}`);
      const deltaKobo = delta ? Number(delta) : 0;
      const unit = dish.price_kobo + deltaKobo;
      return {
        menu_item_id: dish.id,
        name: dish.name,
        unit_price_kobo: unit,
        quantity: Number(qty),
        line_total_kobo: unit * Number(qty),
        position,
        options: groupName
          ? [{ optionId: randomUUID(), groupName, name: optionName, priceDeltaKobo: deltaKobo }]
          : [],
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.line_total_kobo, 0);
    const order = await insertOrder('paid', paidAt, row.fulfilment, subtotal);
    await must(
      testDb()
        .from('order_items')
        .insert(lines.map((l) => ({ ...l, order_id: order.id }))),
    );
    await must(
      testDb()
        .from('payments')
        .insert({
          order_id: order.id,
          reference: `report-${randomUUID()}`,
          access_code: 'test-access-code',
          authorization_url: 'http://localhost/checkout',
          amount_kobo: order.total,
          status: 'success',
          channel: 'card',
          paid_at: paidAt,
        }),
    );
  }
});

Given(
  'an order placed at {string} ended {string}',
  async function (placedAt: string, status: string) {
    const menu = await must(testDb().from('menu_items').select('id, name, price_kobo').limit(1));
    const dish = (menu as Array<{ id: string; name: string; price_kobo: number }>)[0];
    const order = await insertOrder(status, watIso(placedAt), 'pickup', dish.price_kobo);
    await must(
      testDb().from('order_items').insert({
        order_id: order.id,
        menu_item_id: dish.id,
        name: dish.name,
        unit_price_kobo: dish.price_kobo,
        quantity: 1,
        line_total_kobo: dish.price_kobo,
        position: 0,
      }),
    );
  },
);

Given('the menu item {string} is renamed {string}', async function (name: string, to: string) {
  await must(testDb().from('menu_items').update({ name: to }).eq('name', name).select('id'));
});

Then('the report summary is:', function (this: ApiWorld, table: DataTable) {
  for (const [field, expected] of Object.entries(table.rowsHash())) {
    assert.equal(getPath(this.res().body, `summary.${field}`), Number(expected), field);
  }
});

Then('the best sellers are, in order:', function (this: ApiWorld, table: DataTable) {
  const dishes = getPath(this.res().body, 'dishes') as Array<Record<string, unknown>>;
  assert.deepEqual(
    dishes.map((d) => ({
      name: d.name,
      quantity: String(d.quantity),
      salesKobo: String(d.salesKobo),
      orders: String(d.orders),
    })),
    table.hashes(),
  );
});

Then('the dishes that sold nothing are {string}', function (this: ApiWorld, names: string) {
  const unsold = getPath(this.res().body, 'unsoldDishes') as Array<{ name: string }>;
  assert.deepEqual(
    unsold.map((d) => d.name),
    names.split(',').map((n) => n.trim()),
  );
});

Then('the report counts the options:', function (this: ApiWorld, table: DataTable) {
  const options = getPath(this.res().body, 'options') as Array<Record<string, unknown>>;
  assert.deepEqual(
    options.map((o) => ({
      groupName: o.groupName,
      name: o.name,
      quantity: String(o.quantity),
      extraSalesKobo: String(o.extraSalesKobo),
    })),
    table.hashes(),
  );
});

Then(
  'the report day {string} has {int} orders and {int} kobo',
  function (this: ApiWorld, date: string, orders: number, kobo: number) {
    const days = getPath(this.res().body, 'days') as Array<Record<string, unknown>>;
    assert.deepEqual(
      days.find((d) => d.date === date),
      { date, orders, salesKobo: kobo },
    );
  },
);

Then(
  /^the report hour (\d+) has (\d+) orders?$/,
  function (this: ApiWorld, hour: string, orders: string) {
    const hours = getPath(this.res().body, 'hours') as Array<{ hour: number; orders: number }>;
    assert.equal(hours.find((h) => h.hour === Number(hour))?.orders, Number(orders));
  },
);

Then(
  /^the report weekday "(\w+)" has (\d+) orders?$/,
  function (this: ApiWorld, weekday: string, orders: string) {
    const days = getPath(this.res().body, 'weekdays') as Array<{ weekday: string; orders: number }>;
    assert.equal(days.find((d) => d.weekday === weekday)?.orders, Number(orders));
  },
);
