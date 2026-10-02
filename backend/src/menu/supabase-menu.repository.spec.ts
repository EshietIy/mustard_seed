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

describe('SupabaseMenuRepository', () => {
  it('selects only the needed columns, ordered, and maps rows', async () => {
    const { client, calls } = fakeSupabase({ data: [row], error: null });
    const items = await new SupabaseMenuRepository(client as unknown as SupabaseClient).listItems();
    expect(calls.from).toEqual(['menu_items']);
    expect(calls.select[0]).not.toContain('*');
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
