import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { MenuCategoryId } from '../menu/menu.types';
import {
  DishNameTakenError,
  type AdminMenuItem,
  type MenuAdminRepository,
  type MenuItemImage,
  type MenuItemPatch,
  type MoveDirection,
  type NewMenuItem,
} from './menu-admin.repository';

const COLUMNS =
  'id, slug, name, description, category, price_kobo, is_available, is_house_signature, sort_order, archived_at';
const UNIQUE_VIOLATION = '23505';

interface ItemRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: MenuCategoryId;
  price_kobo: number | null;
  is_available: boolean;
  is_house_signature: boolean;
  sort_order: number;
  archived_at: string | null;
}

type DbError = { message: string; code?: string } | null;

/** A clash on the menu-name index is a DishNameTakenError; anything else is a 503. */
function check(op: string, error: DbError): void {
  if (!error) return;
  if (error.code === UNIQUE_VIOLATION && error.message.includes('menu_items_active_name_key')) {
    throw new DishNameTakenError();
  }
  throw new UpstreamUnavailableException('supabase', op, error.message);
}

const toItem = (r: ItemRow): AdminMenuItem => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  category: r.category,
  priceKobo: r.price_kobo,
  isAvailable: r.is_available,
  isHouseSignature: r.is_house_signature,
  sortOrder: r.sort_order,
  archivedAt: r.archived_at,
});

@Injectable()
export class SupabaseMenuAdminRepository implements MenuAdminRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async listItems(): Promise<AdminMenuItem[]> {
    const op = 'menu_items.admin_list';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('menu_items')
        .select(COLUMNS)
        .order('category')
        .order('sort_order')
        .order('name')
        .returns<ItemRow[]>(),
    );
    check(op, error);
    return (data ?? []).map(toItem);
  }

  async createItem(item: NewMenuItem): Promise<AdminMenuItem> {
    const op = 'menu_items.insert';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('menu_items')
        .insert({
          slug: item.slug,
          name: item.name,
          description: item.description,
          category: item.category,
          price_kobo: item.priceKobo,
          is_house_signature: item.isHouseSignature,
          is_fresh_juice: item.isFreshJuice,
          is_available: false,
          sort_order: item.sortOrder,
        })
        .select(COLUMNS)
        .single<ItemRow>(),
    );
    check(op, error);
    return toItem(data as ItemRow);
  }

  async updateItem(id: string, patch: MenuItemPatch): Promise<AdminMenuItem | null> {
    const op = 'menu_items.update';
    const columns: Record<string, unknown> = {};
    if (patch.priceKobo !== undefined) columns.price_kobo = patch.priceKobo;
    if (patch.isAvailable !== undefined) columns.is_available = patch.isAvailable;
    if (patch.name !== undefined) columns.name = patch.name;
    if (patch.description !== undefined) columns.description = patch.description;
    if (patch.category !== undefined) columns.category = patch.category;
    if (patch.isHouseSignature !== undefined) columns.is_house_signature = patch.isHouseSignature;
    if (patch.isFreshJuice !== undefined) columns.is_fresh_juice = patch.isFreshJuice;
    if (patch.sortOrder !== undefined) columns.sort_order = patch.sortOrder;
    if (patch.archived !== undefined) {
      columns.archived_at = patch.archived ? new Date().toISOString() : null;
    }
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('menu_items')
        .update(columns)
        .eq('id', id)
        .select(COLUMNS)
        .maybeSingle<ItemRow>(),
    );
    check(op, error);
    return data ? toItem(data) : null;
  }

  async moveItem(id: string, direction: MoveDirection): Promise<void> {
    const op = 'menu_items.move';
    const { error } = await callUpstream('supabase', op, () =>
      this.db.rpc('move_menu_item', { item_id: id, direction }),
    );
    check(op, error);
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
