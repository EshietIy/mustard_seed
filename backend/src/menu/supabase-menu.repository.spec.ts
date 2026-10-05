import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { SupabaseMenuRepository } from './supabase-menu.repository';
import { fakeSupabase } from '../database/testing/fake-supabase';

const row = {
  id: 'id-1',
  slug: 'zobo',
  name: 'Zobo',
  description: '',
  category: 'drinks',
  price_kobo: 80000,
  is_house_signature: false,
  is_fresh_juice: true,
  is_available: true,
  image_path: null,
  sort_order: 10,
};

const none = { data: [], error: null };

describe('SupabaseMenuRepository', () => {
  it('selects only the needed columns, ordered, and maps rows', async () => {
    const { client, calls } = fakeSupabase({ data: [row], error: null }, none, none, none, none);
    const items = await new SupabaseMenuRepository(client as unknown as SupabaseClient).listItems();
    expect(calls.from).toEqual([
      'menu_items',
      'option_groups',
      'options',
      'menu_item_option_groups',
      'menu_item_option_overrides',
    ]);
    expect(calls.select.every((cols) => !String(cols).includes('*'))).toBe(true);
    expect(calls.order).toEqual(['category', 'sort_order', 'name']);
    expect(items).toEqual([
      {
        id: 'id-1',
        slug: 'zobo',
        name: 'Zobo',
        description: '',
        category: 'drinks',
        priceKobo: 80000,
        isHouseSignature: false,
        isFreshJuice: true,
        isAvailable: true,
        imagePath: null,
        sortOrder: 10,
        optionGroups: [],
      },
    ]);
  });

  it("attaches each item's option groups, with exclusions and price overrides applied", async () => {
    const soup = { ...row, id: 'soup', slug: 'afang', name: 'Afang', category: 'calabar_classics' };
    const { client } = fakeSupabase(
      { data: [soup], error: null },
      {
        data: [
          {
            id: 'g1',
            name: 'Soup protein',
            min_choices: 1,
            max_choices: 1,
            sort_order: 10,
            archived_at: null,
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'o1',
            group_id: 'g1',
            name: 'Beef',
            price_delta_kobo: 0,
            is_available: true,
            sort_order: 10,
            archived_at: null,
          },
          {
            id: 'o2',
            group_id: 'g1',
            name: 'Chicken',
            price_delta_kobo: 5000,
            is_available: true,
            sort_order: 20,
            archived_at: null,
          },
          {
            id: 'o3',
            group_id: 'g1',
            name: 'Goat',
            price_delta_kobo: 0,
            is_available: true,
            sort_order: 30,
            archived_at: '2026-10-01T00:00:00Z',
          },
        ],
        error: null,
      },
      { data: [{ menu_item_id: 'soup', group_id: 'g1', sort_order: 10 }], error: null },
      {
        data: [
          { menu_item_id: 'soup', option_id: 'o1', is_excluded: true, price_delta_kobo: null },
          { menu_item_id: 'soup', option_id: 'o2', is_excluded: false, price_delta_kobo: 7000 },
        ],
        error: null,
      },
    );
    const [item] = await new SupabaseMenuRepository(
      client as unknown as SupabaseClient,
    ).listItems();
    expect(item.optionGroups).toEqual([
      {
        id: 'g1',
        name: 'Soup protein',
        minChoices: 1,
        maxChoices: 1,
        options: [{ id: 'o2', name: 'Chicken', priceDeltaKobo: 7000, isAvailable: true }],
      },
    ]);
  });

  it('turns a Supabase error into a 503 upstream exception', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'fetch failed', code: '' } });
    const repo = new SupabaseMenuRepository(client as unknown as SupabaseClient);
    const err = await repo.listItems().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamUnavailableException);
    expect((err as UpstreamUnavailableException).getStatus()).toBe(503);
    expect((err as Error).message).toContain('fetch failed');
  });

  it('turns a thrown error (e.g. timeout) into a 503 upstream exception', async () => {
    const { client } = fakeSupabase(new Error('The operation was aborted due to timeout'));
    const err = await new SupabaseMenuRepository(client as unknown as SupabaseClient)
      .listItems()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamUnavailableException);
  });
});
