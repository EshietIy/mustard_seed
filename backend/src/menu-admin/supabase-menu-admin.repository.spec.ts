import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { DishNameTakenError } from './menu-admin.repository';
import { SupabaseMenuAdminRepository } from './supabase-menu-admin.repository';

const ok = (data: unknown) => ({ data, error: null });
const down = { data: null, error: { message: 'fetch failed', code: '' } };

const repo = (client: unknown) => new SupabaseMenuAdminRepository(client as SupabaseClient);

const ROW = {
  id: 'i1',
  slug: 'afang-soup',
  name: 'Afang Soup',
  description: 'Waterleaf and afang leaves',
  category: 'calabar_soups',
  price_kobo: null,
  is_available: false,
  is_house_signature: true,
  sort_order: 10,
  archived_at: null,
};
const ITEM = {
  id: 'i1',
  slug: 'afang-soup',
  name: 'Afang Soup',
  description: 'Waterleaf and afang leaves',
  category: 'calabar_soups',
  priceKobo: null,
  isAvailable: false,
  isHouseSignature: true,
  sortOrder: 10,
  archivedAt: null,
};
const nameClash = {
  data: null,
  error: {
    message: 'duplicate key value violates unique constraint "menu_items_active_name_key"',
    code: '23505',
  },
};

describe('SupabaseMenuAdminRepository', () => {
  it('lists every dish, retired ones included, in menu order', async () => {
    const { client, calls } = fakeSupabase(ok([ROW, { ...ROW, archived_at: '2026-10-01' }]));
    const items = await repo(client).listItems();
    expect(items).toEqual([ITEM, { ...ITEM, archivedAt: '2026-10-01' }]);
    expect(calls.from).toEqual(['menu_items']);
    expect(calls.order).toEqual(['category', 'sort_order', 'name']);
    expect(calls.log.some(([m]) => m === 'is')).toBe(false);
  });

  it('lists nothing from an empty table, and fails safely when the database is down', async () => {
    await expect(repo(fakeSupabase(ok(null)).client).listItems()).resolves.toEqual([]);
    await expect(repo(fakeSupabase(down).client).listItems()).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
  });

  it('adds a dish switched off', async () => {
    const { client, calls } = fakeSupabase(ok(ROW));
    await expect(
      repo(client).createItem({
        slug: 'afang-soup',
        name: 'Afang Soup',
        description: 'Waterleaf and afang leaves',
        category: 'calabar_soups',
        priceKobo: null,
        isHouseSignature: true,
        isFreshJuice: false,
        sortOrder: 10,
      }),
    ).resolves.toEqual(ITEM);
    expect(calls.insert).toEqual([
      {
        slug: 'afang-soup',
        name: 'Afang Soup',
        description: 'Waterleaf and afang leaves',
        category: 'calabar_soups',
        price_kobo: null,
        is_house_signature: true,
        is_fresh_juice: false,
        is_available: false,
        sort_order: 10,
      },
    ]);
  });

  it('reports a name already on the menu, and other failures as 503', async () => {
    const dish = {
      slug: 's',
      name: 'n',
      description: '',
      category: 'swallow' as const,
      priceKobo: null,
      isHouseSignature: false,
      isFreshJuice: false,
      sortOrder: 10,
    };
    await expect(repo(fakeSupabase(nameClash).client).createItem(dish)).rejects.toBeInstanceOf(
      DishNameTakenError,
    );
    const slugClash = {
      data: null,
      error: { message: 'violates unique constraint "menu_items_slug_key"', code: '23505' },
    };
    await expect(repo(fakeSupabase(slugClash).client).createItem(dish)).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(
      repo(fakeSupabase(nameClash).client).updateItem('i1', { name: 'n' }),
    ).rejects.toBeInstanceOf(DishNameTakenError);
  });

  it('saves dish details, retiring and bringing back', async () => {
    const edited = fakeSupabase(ok(ROW));
    await repo(edited.client).updateItem('i1', {
      name: 'Afang',
      description: 'd',
      category: 'fresh_juices',
      isHouseSignature: false,
      isFreshJuice: true,
      sortOrder: 40,
    });
    expect(edited.calls.update).toEqual([
      {
        name: 'Afang',
        description: 'd',
        category: 'fresh_juices',
        is_house_signature: false,
        is_fresh_juice: true,
        sort_order: 40,
      },
    ]);

    const retired = fakeSupabase(ok(ROW));
    await repo(retired.client).updateItem('i1', { archived: true });
    expect(retired.calls.update).toEqual([{ archived_at: expect.any(String) }]);

    const back = fakeSupabase(ok(ROW));
    await repo(back.client).updateItem('i1', { archived: false, isAvailable: false });
    expect(back.calls.update).toEqual([{ is_available: false, archived_at: null }]);
  });

  it('moves a dish with one database call', async () => {
    const { client } = fakeSupabase(ok(null));
    const rpc = jest.fn().mockResolvedValue(ok(null));
    await repo({ ...client, rpc }).moveItem('i1', 'up');
    expect(rpc).toHaveBeenCalledWith('move_menu_item', { item_id: 'i1', direction: 'up' });

    const failing = jest.fn().mockResolvedValue(down);
    await expect(repo({ ...client, rpc: failing }).moveItem('i1', 'down')).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
  });

  it('updates only the sent columns and returns the saved dish', async () => {
    const { client, calls } = fakeSupabase(ok(ROW));
    await expect(repo(client).updateItem('i1', { isAvailable: false })).resolves.toEqual(ITEM);
    expect(calls.from).toEqual(['menu_items']);
    expect(calls.update).toEqual([{ is_available: false }]);
    expect(calls.log).toContainEqual(['eq', 'id', 'i1']);
  });

  it('returns null when no dish has that id', async () => {
    const { client } = fakeSupabase(ok(null));
    await expect(repo(client).updateItem('nope', { isAvailable: true })).resolves.toBeNull();
  });

  it('turns a database error into a 503 upstream failure', async () => {
    const { client } = fakeSupabase(down);
    await expect(repo(client).updateItem('i1', { isAvailable: true })).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
  });

  it('saves a price, or no price, in kobo', async () => {
    const row = { ...ROW, name: 'Zobo', category: 'fresh_juices', is_available: true };
    const priced = fakeSupabase(ok({ ...row, price_kobo: 90000 }));
    await expect(repo(priced.client).updateItem('i1', { priceKobo: 90000 })).resolves.toMatchObject(
      {
        priceKobo: 90000,
      },
    );
    expect(priced.calls.update).toEqual([{ price_kobo: 90000 }]);

    const cleared = fakeSupabase(ok({ ...row, price_kobo: null }));
    await repo(cleared.client).updateItem('i1', { priceKobo: null, isAvailable: false });
    expect(cleared.calls.update).toEqual([{ price_kobo: null, is_available: false }]);
  });

  it('finds a dish and its photo key', async () => {
    const { client, calls } = fakeSupabase(
      ok({ id: 'i1', name: 'Afang Soup', image_path: 'menu-items/i1/v1' }),
    );
    await expect(repo(client).findImage('i1')).resolves.toEqual({
      id: 'i1',
      name: 'Afang Soup',
      imagePath: 'menu-items/i1/v1',
    });
    expect(calls.from).toEqual(['menu_items']);
    expect(calls.log).toContainEqual(['eq', 'id', 'i1']);
  });

  it('finds nothing for an unknown dish', async () => {
    const { client } = fakeSupabase(ok(null));
    await expect(repo(client).findImage('nope')).resolves.toBeNull();
  });

  it('saves or clears the photo key', async () => {
    const saved = fakeSupabase(ok(null));
    await repo(saved.client).setImagePath('i1', 'menu-items/i1/v2');
    expect(saved.calls.update).toEqual([{ image_path: 'menu-items/i1/v2' }]);
    expect(saved.calls.log).toContainEqual(['eq', 'id', 'i1']);
    const cleared = fakeSupabase(ok(null));
    await repo(cleared.client).setImagePath('i1', null);
    expect(cleared.calls.update).toEqual([{ image_path: null }]);
  });

  it('turns photo key database errors into 503 upstream failures', async () => {
    const { client } = fakeSupabase(down);
    await expect(repo(client).findImage('i1')).rejects.toBeInstanceOf(UpstreamUnavailableException);
    await expect(repo(client).setImagePath('i1', null)).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
  });
});
