import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import { resolveItemOptionGroups, type OptionRows } from './menu-options';
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

interface GroupRow {
  id: string;
  name: string;
  min_choices: number;
  max_choices: number;
  sort_order: number;
  archived_at: string | null;
}
interface OptionRow {
  id: string;
  group_id: string;
  name: string;
  price_delta_kobo: number;
  is_available: boolean;
  sort_order: number;
  archived_at: string | null;
}
interface LinkRow {
  menu_item_id: string;
  group_id: string;
  sort_order: number;
}
interface OverrideRow {
  menu_item_id: string;
  option_id: string;
  is_excluded: boolean;
  price_delta_kobo: number | null;
}

@Injectable()
export class SupabaseMenuRepository implements MenuRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async listItems(): Promise<MenuItemRecord[]> {
    const op = 'menu_items.list';
    const [items, groups, options, links, overrides] = await Promise.all([
      this.select<MenuItemRow>(op, () =>
        this.db
          .from('menu_items')
          .select(COLUMNS)
          .order('category')
          .order('sort_order')
          .order('name'),
      ),
      this.select<GroupRow>(op, () =>
        this.db
          .from('option_groups')
          .select('id, name, min_choices, max_choices, sort_order, archived_at'),
      ),
      this.select<OptionRow>(op, () =>
        this.db
          .from('options')
          .select('id, group_id, name, price_delta_kobo, is_available, sort_order, archived_at'),
      ),
      this.select<LinkRow>(op, () =>
        this.db.from('menu_item_option_groups').select('menu_item_id, group_id, sort_order'),
      ),
      this.select<OverrideRow>(op, () =>
        this.db
          .from('menu_item_option_overrides')
          .select('menu_item_id, option_id, is_excluded, price_delta_kobo'),
      ),
    ]);
    const optionGroups = resolveItemOptionGroups(toOptionRows(groups, options, links, overrides));
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

function toOptionRows(
  groups: GroupRow[],
  options: OptionRow[],
  links: LinkRow[],
  overrides: OverrideRow[],
): OptionRows {
  return {
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      minChoices: g.min_choices,
      maxChoices: g.max_choices,
      sortOrder: g.sort_order,
      archived: g.archived_at !== null,
    })),
    options: options.map((o) => ({
      id: o.id,
      groupId: o.group_id,
      name: o.name,
      priceDeltaKobo: o.price_delta_kobo,
      isAvailable: o.is_available,
      sortOrder: o.sort_order,
      archived: o.archived_at !== null,
    })),
    links: links.map((l) => ({
      menuItemId: l.menu_item_id,
      groupId: l.group_id,
      sortOrder: l.sort_order,
    })),
    overrides: overrides.map((o) => ({
      menuItemId: o.menu_item_id,
      optionId: o.option_id,
      isExcluded: o.is_excluded,
      priceDeltaKobo: o.price_delta_kobo,
    })),
  };
}
