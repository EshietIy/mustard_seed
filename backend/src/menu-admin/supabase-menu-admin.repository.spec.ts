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
});
