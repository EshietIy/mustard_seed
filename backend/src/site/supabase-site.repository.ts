import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { SiteRepository } from './site.repository';
import type { BranchRecord, RestaurantInfoRecord } from './site.types';

interface RestaurantInfoRow {
  name: string;
  phone_whatsapp: string | null;
  opens_at: string;
  closes_at: string;
  online_orders_close_at: string;
  timezone: string;
  delivery_fee_kobo: number;
  delivery_area: string;
}

interface BranchRow {
  id: string;
  city: string;
  state: string;
  role: 'headquarters' | 'branch';
  street_address: string | null;
  online_ordering_enabled: boolean;
}

@Injectable()
export class SupabaseSiteRepository implements SiteRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async getRestaurantInfo(): Promise<RestaurantInfoRecord | null> {
    const op = 'restaurant_info.get';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('restaurant_info')
        .select(
          'name, phone_whatsapp, opens_at, closes_at, online_orders_close_at, timezone, delivery_fee_kobo, delivery_area',
        )
        .maybeSingle<RestaurantInfoRow>(),
    );
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    const row = data;
    if (!row) return null;
    return {
      name: row.name,
      phoneWhatsapp: row.phone_whatsapp,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      onlineOrdersCloseAt: row.online_orders_close_at,
      timezone: row.timezone,
      deliveryFeeKobo: row.delivery_fee_kobo,
      deliveryArea: row.delivery_area,
    };
  }

  async listBranches(): Promise<BranchRecord[]> {
    const op = 'branches.list';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('branches')
        .select('id, city, state, role, street_address, online_ordering_enabled')
        .order('sort_order'),
    );
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    return ((data ?? []) as BranchRow[]).map((r) => ({
      id: r.id,
      city: r.city,
      state: r.state,
      role: r.role,
      streetAddress: r.street_address,
      onlineOrderingEnabled: r.online_ordering_enabled,
    }));
  }
}
