import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { MenuCategoryId } from '../menu/menu.types';
import type { AdminMenuItem, MenuAdminRepository, MenuItemPatch } from './menu-admin.repository';

interface ItemRow {
  id: string;
  name: string;
  category: MenuCategoryId;
  price_kobo: number | null;
  is_available: boolean;
}

@Injectable()
export class SupabaseMenuAdminRepository implements MenuAdminRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async updateItem(id: string, patch: MenuItemPatch): Promise<AdminMenuItem | null> {
    const op = 'menu_items.update';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('menu_items')
        .update({ ...(patch.isAvailable !== undefined && { is_available: patch.isAvailable }) })
        .eq('id', id)
        .select('id, name, category, price_kobo, is_available')
        .maybeSingle<ItemRow>(),
    );
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      category: data.category,
      priceKobo: data.price_kobo,
      isAvailable: data.is_available,
    };
  }
}
