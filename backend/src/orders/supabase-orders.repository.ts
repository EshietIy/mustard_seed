import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { NewOrder, OrdersRepository } from './orders.repository';
import type { Fulfilment } from './pricing';
import type { AuditEvent, OrderRecord, OrderStatus } from './orders.types';

const COLUMNS =
  'id, order_number, tracking_token, user_id, status, fulfilment, branch_id, contact_full_name, contact_phone, delivery_street_address, delivery_city, subtotal_kobo, delivery_fee_kobo, total_kobo, created_at, order_items(menu_item_id, name, unit_price_kobo, quantity, line_total_kobo, position)';

interface OrderRow {
  id: string;
  order_number: number;
  tracking_token: string;
  user_id: string;
  status: OrderStatus;
  fulfilment: Fulfilment;
  branch_id: string;
  contact_full_name: string;
  contact_phone: string;
  delivery_street_address: string | null;
  delivery_city: string | null;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  total_kobo: number;
  created_at: string;
  order_items: Array<{
    menu_item_id: string;
    name: string;
    unit_price_kobo: number;
    quantity: number;
    line_total_kobo: number;
    position: number;
  }>;
}

const fail = (op: string, message: string) =>
  new UpstreamUnavailableException('supabase', op, message);

@Injectable()
export class SupabaseOrdersRepository implements OrdersRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async create(
    order: NewOrder,
    correlationId: string,
  ): Promise<{ orderId: string; created: boolean }> {
    const op = 'orders.create';
    const { data, error } = await callUpstream<{
      data: unknown;
      error: { message: string } | null;
    }>('supabase', op, () =>
      this.db.rpc('create_order', {
        p_order: {
          user_id: order.userId,
          client_request_id: order.clientRequestId,
          tracking_token: order.trackingToken,
          fulfilment: order.fulfilment,
          branch_id: order.branchId,
          contact_full_name: order.contactFullName,
          contact_phone: order.contactPhone,
          delivery_street_address: order.deliveryStreetAddress,
          delivery_city: order.deliveryCity,
          subtotal_kobo: order.subtotalKobo,
          delivery_fee_kobo: order.deliveryFeeKobo,
          total_kobo: order.totalKobo,
        },
        p_items: order.items.map((i) => ({
          menu_item_id: i.menuItemId,
          name: i.name,
          unit_price_kobo: i.unitPriceKobo,
          quantity: i.quantity,
          line_total_kobo: i.lineTotalKobo,
        })),
        p_correlation_id: correlationId,
      }),
    );
    if (error) throw fail(op, error.message);
    const result = (data as Array<{ order_id: string; created: boolean }> | null)?.[0];
    if (!result) throw fail(op, 'create_order returned no row');
    return { orderId: result.order_id, created: result.created };
  }

  async findById(id: string): Promise<OrderRecord | null> {
    const op = 'orders.find_by_id';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db.from('orders').select(COLUMNS).eq('id', id).maybeSingle<OrderRow>(),
    );
    if (error) throw fail(op, error.message);
    if (!data) return null;
    return {
      id: data.id,
      orderNumber: data.order_number,
      trackingToken: data.tracking_token,
      userId: data.user_id,
      status: data.status,
      fulfilment: data.fulfilment,
      branchId: data.branch_id,
      contactFullName: data.contact_full_name,
      contactPhone: data.contact_phone,
      deliveryStreetAddress: data.delivery_street_address,
      deliveryCity: data.delivery_city,
      subtotalKobo: data.subtotal_kobo,
      deliveryFeeKobo: data.delivery_fee_kobo,
      totalKobo: data.total_kobo,
      createdAt: data.created_at,
      items: [...data.order_items]
        .sort((a, b) => a.position - b.position)
        .map((i) => ({
          menuItemId: i.menu_item_id,
          name: i.name,
          unitPriceKobo: i.unit_price_kobo,
          quantity: i.quantity,
          lineTotalKobo: i.line_total_kobo,
        })),
    };
  }

  async findIdByClientRequest(userId: string, clientRequestId: string): Promise<string | null> {
    const op = 'orders.find_by_client_request';
    const { data, error } = await callUpstream('supabase', op, () =>
      this.db
        .from('orders')
        .select('id')
        .eq('user_id', userId)
        .eq('client_request_id', clientRequestId)
        .maybeSingle<{ id: string }>(),
    );
    if (error) throw fail(op, error.message);
    return data?.id ?? null;
  }

  async recordAudit(event: AuditEvent): Promise<void> {
    const op = 'audit_events.insert';
    const { error } = await callUpstream('supabase', op, () =>
      this.db.from('audit_events').insert({
        event: event.event,
        outcome: event.outcome,
        user_id: event.userId ?? null,
        order_id: event.orderId ?? null,
        error_code: event.errorCode ?? null,
        amount_kobo: event.amountKobo ?? null,
        from_status: event.fromStatus ?? null,
        to_status: event.toStatus ?? null,
        correlation_id: event.correlationId ?? null,
        details: event.details ?? {},
      }),
    );
    if (error) throw fail(op, error.message);
  }
}
