import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { SupabaseCartRepository } from './supabase-cart.repository';

const ok = (data: unknown) => ({ data, error: null });
const down = { data: null, error: { message: 'fetch failed', code: '' } };
const repo = (client: unknown) => new SupabaseCartRepository(client as SupabaseClient);

describe('SupabaseCartRepository', () => {
  it("lists only the user's lines, oldest first", async () => {
    const { client, calls } = fakeSupabase(
      ok([
        {
          id: 'l1',
          menu_item_id: 'm1',
          option_ids: ['o1'],
          quantity: 2,
          seen_unit_price_kobo: 450000,
        },
      ]),
    );
    await expect(repo(client).list('u1')).resolves.toEqual([
      { id: 'l1', menuItemId: 'm1', optionIds: ['o1'], quantity: 2, seenUnitPriceKobo: 450000 },
    ]);
    expect(calls.log).toEqual(expect.arrayContaining([['eq', 'user_id', 'u1']]));
    expect(calls.order).toEqual(['created_at', 'id']);
  });

  it('sets a line with an upsert on the user, item and choices', async () => {
    const { client, calls } = fakeSupabase(ok(null));
    await repo(client).setLine('u1', {
      menuItemId: 'm1',
      optionIds: ['o1'],
      quantity: 3,
      seenUnitPriceKobo: 450000,
    });
    expect(calls.log.find((c) => c[0] === 'upsert')).toEqual([
      'upsert',
      {
        user_id: 'u1',
        menu_item_id: 'm1',
        option_ids: ['o1'],
        quantity: 3,
        seen_unit_price_kobo: 450000,
      },
      { onConflict: 'user_id,menu_item_id,option_ids' },
    ]);
  });

  it("deletes a line only within the user's cart", async () => {
    const found = fakeSupabase(ok([{ id: 'l1' }]));
    await expect(repo(found.client).deleteLine('u1', 'l1')).resolves.toBe(true);
    expect(found.calls.log).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'u1'],
        ['eq', 'id', 'l1'],
      ]),
    );
    await expect(repo(fakeSupabase(ok([])).client).deleteLine('u1', 'l1')).resolves.toBe(false);
  });

  it('merges through one database function', async () => {
    const fake = fakeSupabase(ok(null));
    (fake.client as Record<string, unknown>).rpc = (fn: string, args: unknown) => {
      fake.calls.log.push(['rpc', fn, args]);
      return Promise.resolve(ok(null));
    };
    await repo(fake.client).merge('u1', [
      { menuItemId: 'm1', optionIds: [], quantity: 2, seenUnitPriceKobo: 80000 },
    ]);
    expect(fake.calls.log.find((c) => c[0] === 'rpc')).toEqual([
      'rpc',
      'merge_cart_lines',
      {
        p_user_id: 'u1',
        p_lines: [{ menu_item_id: 'm1', option_ids: [], quantity: 2, seen_unit_price_kobo: 80000 }],
      },
    ]);
  });

  it('maps database failures to 503', async () => {
    await expect(repo(fakeSupabase(down).client).list('u1')).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(repo(fakeSupabase(down).client).clear('u1')).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
  });
});
