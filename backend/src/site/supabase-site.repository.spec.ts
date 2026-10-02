import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { SupabaseSiteRepository } from './supabase-site.repository';

describe('SupabaseSiteRepository', () => {
  it('maps the restaurant_info row', async () => {
    const { client, calls } = fakeSupabase({
      data: {
        name: 'Mustard Seed Restaurant & Bar',
        phone_whatsapp: null,
        opens_at: '08:00:00',
        closes_at: '23:00:00',
        online_orders_close_at: '22:30:00',
        timezone: 'Africa/Lagos',
        delivery_fee_kobo: 150000,
        delivery_area: 'Calabar',
      },
      error: null,
    });
    const info = await new SupabaseSiteRepository(
      client as unknown as SupabaseClient,
    ).getRestaurantInfo();
    expect(calls.from).toEqual(['restaurant_info']);
    expect(info).toEqual({
      name: 'Mustard Seed Restaurant & Bar',
      phoneWhatsapp: null,
      opensAt: '08:00:00',
      closesAt: '23:00:00',
      onlineOrdersCloseAt: '22:30:00',
      timezone: 'Africa/Lagos',
      deliveryFeeKobo: 150000,
      deliveryArea: 'Calabar',
    });
  });

  it('returns null when the settings row is missing', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    await expect(
      new SupabaseSiteRepository(client as unknown as SupabaseClient).getRestaurantInfo(),
    ).resolves.toBeNull();
  });

  it('maps branches in sort order', async () => {
    const { client, calls } = fakeSupabase({
      data: [
        {
          id: 'calabar',
          city: 'Calabar',
          state: 'Cross River State',
          role: 'headquarters',
          street_address: null,
          online_ordering_enabled: true,
        },
      ],
      error: null,
    });
    const branches = await new SupabaseSiteRepository(
      client as unknown as SupabaseClient,
    ).listBranches();
    expect(calls.order).toEqual(['sort_order']);
    expect(branches).toEqual([
      {
        id: 'calabar',
        city: 'Calabar',
        state: 'Cross River State',
        role: 'headquarters',
        streetAddress: null,
        onlineOrderingEnabled: true,
      },
    ]);
  });

  it.each(['getRestaurantInfo', 'listBranches'] as const)(
    '%s maps Supabase errors to a 503',
    async (method) => {
      const { client } = fakeSupabase({ data: null, error: { message: 'boom', code: 'X' } });
      await expect(
        new SupabaseSiteRepository(client as unknown as SupabaseClient)[method](),
      ).rejects.toBeInstanceOf(UpstreamUnavailableException);
    },
  );
});
