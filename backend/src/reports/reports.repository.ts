import type { MenuCategoryId } from '../menu/menu.types';
import type { Fulfilment } from '../orders/pricing';

export const REPORTS_REPOSITORY = Symbol('REPORTS_REPOSITORY');

/** One order line as it was sold (names and prices are the order's own snapshot). */
export interface SoldLine {
  menuItemId: string;
  name: string;
  quantity: number;
  lineTotalKobo: number;
  options: Array<{ groupName: string; name: string; priceDeltaKobo: number }>;
}

/** An order whose payment succeeded. */
export interface PaidOrder {
  orderId: string;
  /** ISO time the payment cleared. */
  paidAt: string;
  fulfilment: Fulfilment;
  subtotalKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  lines: SoldLine[];
}

/** A dish as it is now, to name report rows and find dishes that sold nothing. */
export interface ReportDish {
  id: string;
  name: string;
  category: MenuCategoryId;
  retired: boolean;
}

export interface UnpaidCounts {
  paymentFailed: number;
  expired: number;
}

/**
 * Reads for the sales reports (AGENT.md 3.4: reports are super_admin only). The reports
 * themselves are worked out in ReportsService, so they do not depend on the database.
 */
export interface ReportsRepository {
  /** Orders paid in [from, to), cancelled ones excluded, with their lines. */
  paidOrders(from: Date, to: Date): Promise<PaidOrder[]>;
  /** Orders placed in [from, to) that ended unpaid. */
  unpaidCounts(from: Date, to: Date): Promise<UnpaidCounts>;
  /** Every dish, retired ones included. */
  dishes(): Promise<ReportDish[]>;
}
