import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { SupabaseMenuAdminRepository } from './supabase-menu-admin.repository';

const ok = (data: unknown) => ({ data, error: null });
const down = { data: null, error: { message: 'fetch failed', code: '' } };

const repo = (client: unknown) => new SupabaseMenuAdminRepository(client as SupabaseClient);

describe('SupabaseMenuAdminRepository', () => {
  it('updates only the sent columns and returns the saved dish', async () => {
    const { client, calls } = fakeSupabase(
      ok({
        id: 'i1',
        name: 'Afang Soup',
        category: 'calabar_soups',
        price_kobo: null,
        is_available: false,
      }),
    );
    await expect(repo(client).updateItem('i1', { isAvailable: false })).resolves.toEqual({
      id: 'i1',
      name: 'Afang Soup',
      category: 'calabar_soups',
      priceKobo: null,
      isAvailable: false,
    });
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
    const row = { id: 'i1', name: 'Zobo', category: 'fresh_juices', is_available: true };
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
