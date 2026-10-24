import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { MenuCategoryId } from '../menu/menu.types';
import type {
  AdminMenuItem,
  MenuAdminRepository,
  MenuItemImage,
  MenuItemPatch,
} from './menu-admin.repository';

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
        .update({
          ...(patch.priceKobo !== undefined && { price_kobo: patch.priceKobo }),
          ...(patch.isAvailable !== undefined && { is_available: patch.isAvailable }),
        })
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

  async findImage(id: string): Promise<MenuItemImage | null> {
    const op = 'menu_items.find_image';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('menu_items')
        .select('id, name, image_path')
        .eq('id', id)
        .maybeSingle<{ id: string; name: string; image_path: string | null }>(),
    );
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    return data ? { id: data.id, name: data.name, imagePath: data.image_path } : null;
  }

  async setImagePath(id: string, imagePath: string | null): Promise<void> {
    const op = 'menu_items.set_image';
    const { error } = await callUpstream('supabase', op, () =>
      this.db.from('menu_items').update({ image_path: imagePath }).eq('id', id),
    );
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
  }
}
