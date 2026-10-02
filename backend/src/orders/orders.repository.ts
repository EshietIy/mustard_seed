import type { Fulfilment } from './pricing';
import type { AuditEvent, OrderItemRecord, OrderRecord } from './orders.types';

export const ORDERS_REPOSITORY = Symbol('ORDERS_REPOSITORY');

export interface NewOrder {
  userId: string;
  clientRequestId: string;
  trackingToken: string;
  fulfilment: Fulfilment;
  branchId: string;
  contactFullName: string;
  contactPhone: string;
  deliveryStreetAddress: string | null;
  deliveryCity: string | null;
  subtotalKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  items: OrderItemRecord[];
}

export interface OrdersRepository {
  /**
   * Atomically creates the order, its items and the 'order.created' audit record.
   * Idempotent per (userId, clientRequestId): returns the existing order with created=false.
   */
  create(order: NewOrder, correlationId: string): Promise<{ orderId: string; created: boolean }>;
  findById(id: string): Promise<OrderRecord | null>;
  findIdByClientRequest(userId: string, clientRequestId: string): Promise<string | null>;
  recordAudit(event: AuditEvent): Promise<void>;
}
