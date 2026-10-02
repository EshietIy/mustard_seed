import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { MenuRepository } from './menu.repository';
import type { MenuCategoryId, MenuItemRecord } from './menu.types';

const COLUMNS =
  'id, slug, name, description, category, price_kobo, is_house_signature, is_fresh_juice, is_available, image_path, sort_order';

interface MenuItemRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: MenuCategoryId;
  price_kobo: number | null;
  is_house_signature: boolean;
  is_fresh_juice: boolean;
  is_available: boolean;
  image_path: string | null;
  sort_order: number;
}

@Injectable()
export class SupabaseMenuRepository implements MenuRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async listItems(): Promise<MenuItemRecord[]> {
    const { data, error } = await callUpstream('supabase', 'menu_items.list', () =>
      this.db
        .from('menu_items')
        .select(COLUMNS)
        .order('category')
        .order('sort_order')
        .order('name'),
    );
    if (error) throw new UpstreamUnavailableException('supabase', 'menu_items.list', error.message);
    return ((data ?? []) as MenuItemRow[]).map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      category: r.category,
      priceKobo: r.price_kobo,
      isHouseSignature: r.is_house_signature,
      isFreshJuice: r.is_fresh_juice,
      isAvailable: r.is_available,
      imagePath: r.image_path,
      sortOrder: r.sort_order,
    }));
  }
}
