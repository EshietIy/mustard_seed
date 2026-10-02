import type { Fulfilment } from './pricing';

export type OrderStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'collected'
  | 'payment_failed'
  | 'expired'
  | 'cancelled';

export interface OrderItemRecord {
  menuItemId: string;
  name: string;
  unitPriceKobo: number;
  quantity: number;
  lineTotalKobo: number;
}

export interface OrderRecord {
  id: string;
  orderNumber: number;
  trackingToken: string;
  userId: string;
  status: OrderStatus;
  fulfilment: Fulfilment;
  branchId: string;
  contactFullName: string;
  contactPhone: string;
  deliveryStreetAddress: string | null;
  deliveryCity: string | null;
  subtotalKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  createdAt: string;
  items: OrderItemRecord[];
}

export interface AuditEvent {
  event: string;
  outcome: 'SUCCESS' | 'FAILED';
  userId?: string | null;
  orderId?: string | null;
  errorCode?: string | null;
  amountKobo?: number | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  correlationId?: string | null;
  details?: Record<string, unknown>;
}
