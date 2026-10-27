import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { SettingsPatch, SettingsRecord, SettingsRepository } from './settings.repository';

interface SettingsRow {
  delivery_fee_kobo: number;
  delivery_area: string;
  opens_at: string;
  closes_at: string;
  online_orders_close_at: string;
  timezone: string;
}

const COLUMNS =
  'delivery_fee_kobo, delivery_area, opens_at, closes_at, online_orders_close_at, timezone';

const toRecord = (row: SettingsRow): SettingsRecord => ({
  deliveryFeeKobo: row.delivery_fee_kobo,
  deliveryArea: row.delivery_area,
  opensAt: row.opens_at,
  closesAt: row.closes_at,
  onlineOrdersCloseAt: row.online_orders_close_at,
  timezone: row.timezone,
});

const COLUMN_OF: Record<keyof SettingsPatch, keyof SettingsRow> = {
  deliveryFeeKobo: 'delivery_fee_kobo',
  opensAt: 'opens_at',
  closesAt: 'closes_at',
  onlineOrdersCloseAt: 'online_orders_close_at',
};

/** restaurant_info has exactly one row, keyed id = true. */
@Injectable()
export class SupabaseSettingsRepository implements SettingsRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async get(): Promise<SettingsRecord | null> {
    const op = 'restaurant_info.get';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db.from('restaurant_info').select(COLUMNS).maybeSingle<SettingsRow>(),
    );
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    return data ? toRecord(data) : null;
  }

  async update(patch: SettingsPatch): Promise<SettingsRecord> {
    const op = 'restaurant_info.update';
    const row = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [COLUMN_OF[key as keyof SettingsPatch], value]),
    );
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('restaurant_info')
        .update(row)
        .eq('id', true)
        .select(COLUMNS)
        .single<SettingsRow>(),
    );
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    return toRecord(data);
  }
}
