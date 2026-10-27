import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { SupabaseSettingsRepository } from './supabase-settings.repository';

const ROW = {
  delivery_fee_kobo: 150000,
  delivery_area: 'Calabar',
  opens_at: '08:00:00',
  closes_at: '23:00:00',
  online_orders_close_at: '22:30:00',
  timezone: 'Africa/Lagos',
};
const RECORD = {
  deliveryFeeKobo: 150000,
  deliveryArea: 'Calabar',
  opensAt: '08:00:00',
  closesAt: '23:00:00',
  onlineOrdersCloseAt: '22:30:00',
  timezone: 'Africa/Lagos',
};
const repoFor = (client: unknown) => new SupabaseSettingsRepository(client as SupabaseClient);

describe('SupabaseSettingsRepository', () => {
  it('reads the single restaurant_info row', async () => {
    const { client, calls } = fakeSupabase({ data: ROW, error: null });
    await expect(repoFor(client).get()).resolves.toEqual(RECORD);
    expect(calls.from).toEqual(['restaurant_info']);
  });

  it('returns null when the row is missing', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    await expect(repoFor(client).get()).resolves.toBeNull();
  });

  it('updates the single row with column names', async () => {
    const { client, calls } = fakeSupabase({
      data: { ...ROW, delivery_fee_kobo: 200000, closes_at: '22:30:00' },
      error: null,
    });
    await expect(
      repoFor(client).update({ deliveryFeeKobo: 200000, closesAt: '22:30' }),
    ).resolves.toEqual({ ...RECORD, deliveryFeeKobo: 200000, closesAt: '22:30:00' });
    expect(calls.update).toEqual([{ delivery_fee_kobo: 200000, closes_at: '22:30' }]);
    expect(calls.eq).toEqual(['id']);
  });

  it('reports a database error as unavailable', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { message: 'connection refused', code: '08006' },
    });
    await expect(repoFor(client).update({ deliveryFeeKobo: 1 })).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    const { client: down } = fakeSupabase({
      data: null,
      error: { message: 'down', code: '08006' },
    });
    await expect(repoFor(down).get()).rejects.toBeInstanceOf(UpstreamUnavailableException);
  });
});
