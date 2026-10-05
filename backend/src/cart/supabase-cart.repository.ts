import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { CartLineRecord, CartLineWrite, CartRepository } from './cart.repository';

interface CartLineRow {
  id: string;
  menu_item_id: string;
  option_ids: string[];
  quantity: number;
  seen_unit_price_kobo: number | null;
}

type Result = { data: unknown; error: { message: string } | null };

const toRow = (line: CartLineWrite) => ({
  menu_item_id: line.menuItemId,
  option_ids: line.optionIds,
  quantity: line.quantity,
  seen_unit_price_kobo: line.seenUnitPriceKobo,
});

@Injectable()
export class SupabaseCartRepository implements CartRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async list(userId: string): Promise<CartLineRecord[]> {
    const data = await this.run('cart_lines.list', () =>
      this.db
        .from('cart_lines')
        .select('id, menu_item_id, option_ids, quantity, seen_unit_price_kobo')
        .eq('user_id', userId)
        .order('created_at')
        .order('id'),
    );
    return ((data ?? []) as CartLineRow[]).map((r) => ({
      id: r.id,
      menuItemId: r.menu_item_id,
      optionIds: r.option_ids,
      quantity: r.quantity,
      seenUnitPriceKobo: r.seen_unit_price_kobo,
    }));
  }

  async setLine(userId: string, line: CartLineWrite): Promise<void> {
    await this.run('cart_lines.set', () =>
      this.db
        .from('cart_lines')
        .upsert(
          { user_id: userId, ...toRow(line) },
          { onConflict: 'user_id,menu_item_id,option_ids' },
        ),
    );
  }

  async deleteLine(userId: string, lineId: string): Promise<boolean> {
    const data = await this.run('cart_lines.delete', () =>
      this.db.from('cart_lines').delete().eq('user_id', userId).eq('id', lineId).select('id'),
    );
    return ((data ?? []) as unknown[]).length > 0;
  }

  async clear(userId: string): Promise<void> {
    await this.run('cart_lines.clear', () =>
      this.db.from('cart_lines').delete().eq('user_id', userId),
    );
  }

  async merge(userId: string, lines: CartLineWrite[]): Promise<void> {
    await this.run('cart_lines.merge', () =>
      this.db.rpc('merge_cart_lines', { p_user_id: userId, p_lines: lines.map(toRow) }),
    );
  }

  private async run(op: string, query: () => PromiseLike<Result>): Promise<unknown> {
    const { data, error } = await callUpstream<Result>('supabase', op, query);
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    return data;
  }
}
