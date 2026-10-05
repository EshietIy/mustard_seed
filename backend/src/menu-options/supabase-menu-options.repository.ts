import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { OptionRows } from '../menu/menu-options';
import { fetchOptionRows } from '../menu/supabase-option-rows';
import {
  OptionNameTakenError,
  type GroupWrite,
  type MenuOptionsRepository,
  type OptionWrite,
} from './menu-options.repository';

const UNIQUE_VIOLATION = '23505';

type DbError = { message: string; code?: string } | null;

/** Duplicate names become OptionNameTakenError; anything else is a 503 upstream failure. */
function check(op: string, error: DbError): void {
  if (!error) return;
  if (error.code === UNIQUE_VIOLATION) throw new OptionNameTakenError();
  throw new UpstreamUnavailableException('supabase', op, error.message);
}

const archivedAt = (archived: boolean | undefined) =>
  archived === undefined ? {} : { archived_at: archived ? new Date().toISOString() : null };

@Injectable()
export class SupabaseMenuOptionsRepository implements MenuOptionsRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  loadAll(): Promise<OptionRows> {
    return fetchOptionRows(this.db, 'options.load');
  }

  async listMenuItemIds(): Promise<string[]> {
    const op = 'menu_items.ids';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db.from('menu_items').select('id'),
    );
    check(op, error);
    return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  }

  async createGroup(input: GroupWrite): Promise<string> {
    const op = 'option_groups.create';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('option_groups')
        .insert({
          name: input.name,
          min_choices: input.minChoices,
          max_choices: input.maxChoices,
          sort_order: input.sortOrder,
        })
        .select('id')
        .single<{ id: string }>(),
    );
    check(op, error);
    return (data as { id: string }).id;
  }

  async updateGroup(
    id: string,
    patch: Partial<GroupWrite> & { archived?: boolean },
  ): Promise<void> {
    const op = 'option_groups.update';
    const { error } = await callUpstream('supabase', op, () =>
      this.db
        .from('option_groups')
        .update({
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.minChoices !== undefined && { min_choices: patch.minChoices }),
          ...(patch.maxChoices !== undefined && { max_choices: patch.maxChoices }),
          ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
          ...archivedAt(patch.archived),
        })
        .eq('id', id),
    );
    check(op, error);
  }

  async createOption(
    groupId: string,
    input: OptionWrite,
    excludeItemIds: string[],
  ): Promise<string> {
    const op = 'options.create';
    const { data, error } = await callUpstream<{ data: unknown; error: DbError }>(
      'supabase',
      op,
      () =>
        this.db.rpc('create_option', {
          p_group_id: groupId,
          p_name: input.name,
          p_price_delta_kobo: input.priceDeltaKobo,
          p_sort_order: input.sortOrder,
          p_exclude_item_ids: excludeItemIds,
        }),
    );
    check(op, error);
    return data as string;
  }

  async updateOption(
    id: string,
    patch: Partial<OptionWrite> & { isAvailable?: boolean; archived?: boolean },
  ): Promise<void> {
    const op = 'options.update';
    const { error } = await callUpstream('supabase', op, () =>
      this.db
        .from('options')
        .update({
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.priceDeltaKobo !== undefined && { price_delta_kobo: patch.priceDeltaKobo }),
          ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
          ...(patch.isAvailable !== undefined && { is_available: patch.isAvailable }),
          ...archivedAt(patch.archived),
        })
        .eq('id', id),
    );
    check(op, error);
  }

  async setItemGroups(itemId: string, groupIds: string[]): Promise<void> {
    const op = 'menu_item_option_groups.set';
    const { error } = await callUpstream<{ data: unknown; error: DbError }>('supabase', op, () =>
      this.db.rpc('set_item_option_groups', { p_item_id: itemId, p_group_ids: groupIds }),
    );
    check(op, error);
  }

  async upsertOverride(
    itemId: string,
    optionId: string,
    value: { isExcluded: boolean; priceDeltaKobo: number | null },
  ): Promise<void> {
    const op = 'menu_item_option_overrides.upsert';
    const { error } = await callUpstream('supabase', op, () =>
      this.db.from('menu_item_option_overrides').upsert(
        {
          menu_item_id: itemId,
          option_id: optionId,
          is_excluded: value.isExcluded,
          price_delta_kobo: value.priceDeltaKobo,
        },
        { onConflict: 'menu_item_id,option_id' },
      ),
    );
    check(op, error);
  }

  async deleteOverride(itemId: string, optionId: string): Promise<boolean> {
    const op = 'menu_item_option_overrides.delete';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('menu_item_option_overrides')
        .delete()
        .eq('menu_item_id', itemId)
        .eq('option_id', optionId)
        .select('option_id'),
    );
    check(op, error);
    return ((data ?? []) as unknown[]).length > 0;
  }
}
