import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import { resolveItemOptionGroups } from './menu-options';
import type { MenuRepository } from './menu.repository';
import { fetchOptionRows } from './supabase-option-rows';
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
    const op = 'menu_items.list';
    const [items, rows] = await Promise.all([
      this.select<MenuItemRow>(op, () =>
        this.db
          .from('menu_items')
          .select(COLUMNS)
          .order('category')
          .order('sort_order')
          .order('name'),
      ),
      fetchOptionRows(this.db, op),
    ]);
    const optionGroups = resolveItemOptionGroups(rows);
    return items.map((r) => ({
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
      optionGroups: optionGroups.get(r.id) ?? [],
    }));
  }

  private async select<T>(
    op: string,
    query: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<T[]> {
    const { data, error } = await callUpstream('supabase', op, query);
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    return (data ?? []) as T[];
  }
}
