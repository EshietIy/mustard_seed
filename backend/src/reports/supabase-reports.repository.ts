import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { MenuCategoryId } from '../menu/menu.types';
import type { Fulfilment } from '../orders/pricing';
import type { PaidOrder, ReportDish, ReportsRepository, UnpaidCounts } from './reports.repository';

/** Supabase returns at most 1,000 rows per request, so paid orders are read in pages. */
export const PAGE_SIZE = 1000;

const PAID_ORDER_COLUMNS =
  'paid_at, order:orders!inner(id, status, fulfilment, subtotal_kobo, delivery_fee_kobo, total_kobo, ' +
  'order_items(menu_item_id, name, quantity, line_total_kobo, options))';

interface PaymentRow {
  paid_at: string;
  order: {
    id: string;
    fulfilment: Fulfilment;
    subtotal_kobo: number;
    delivery_fee_kobo: number;
    total_kobo: number;
    order_items: Array<{
      menu_item_id: string;
      name: string;
      quantity: number;
      line_total_kobo: number;
      options: Array<{ groupName: string; name: string; priceDeltaKobo: number }>;
    }>;
  };
}

type Result = { data: unknown; error: { message: string } | null; count?: number | null };

@Injectable()
export class SupabaseReportsRepository implements ReportsRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async paidOrders(from: Date, to: Date): Promise<PaidOrder[]> {
    const op = 'reports.paid_orders';
    const rows: PaymentRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await this.run<PaymentRow[]>(op, () =>
        this.db
          .from('payments')
          .select(PAID_ORDER_COLUMNS)
          .eq('status', 'success')
          .gte('paid_at', from.toISOString())
          .lt('paid_at', to.toISOString())
          .neq('order.status', 'cancelled')
          .order('paid_at')
          .order('id')
          .range(offset, offset + PAGE_SIZE - 1),
      );
      rows.push(...(page ?? []));
      if (!page || page.length < PAGE_SIZE) break;
    }
    return rows.map((r) => ({
      orderId: r.order.id,
      paidAt: r.paid_at,
      fulfilment: r.order.fulfilment,
      subtotalKobo: r.order.subtotal_kobo,
      deliveryFeeKobo: r.order.delivery_fee_kobo,
      totalKobo: r.order.total_kobo,
      lines: r.order.order_items.map((i) => ({
        menuItemId: i.menu_item_id,
        name: i.name,
        quantity: i.quantity,
        lineTotalKobo: i.line_total_kobo,
        options: (i.options ?? []).map((o) => ({
          groupName: o.groupName,
          name: o.name,
          priceDeltaKobo: o.priceDeltaKobo,
        })),
      })),
    }));
  }

  async unpaidCounts(from: Date, to: Date): Promise<UnpaidCounts> {
    const count = async (status: string) => {
      const op = `reports.count_${status}`;
      const { count: n, error } = await callUpstream('supabase', op, () =>
        this.db
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', status)
          .gte('created_at', from.toISOString())
          .lt('created_at', to.toISOString()),
      );
      if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
      return n ?? 0;
    };
    const [paymentFailed, expired] = await Promise.all([count('payment_failed'), count('expired')]);
    return { paymentFailed, expired };
  }

  async dishes(): Promise<ReportDish[]> {
    const rows = await this.run<
      Array<{ id: string; name: string; category: MenuCategoryId; archived_at: string | null }>
    >('reports.dishes', () => this.db.from('menu_items').select('id, name, category, archived_at'));
    return (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      retired: r.archived_at !== null,
    }));
  }

  private async run<T>(op: string, query: () => PromiseLike<Result>): Promise<T | null> {
    const { data, error } = await callUpstream('supabase', op, query);
    if (error) throw new UpstreamUnavailableException('supabase', op, error.message);
    return data as T | null;
  }
}
