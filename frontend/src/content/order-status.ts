/** Customer-facing label for each order status. */
export const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid — in the kitchen',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  collected: 'Collected',
  payment_failed: 'Payment didn’t go through',
  expired: 'Expired — not paid in time',
  cancelled: 'Cancelled',
};

/** Statuses that never change again: live pages stop refreshing. */
export const FINAL_STATUSES = new Set([
  'delivered',
  'collected',
  'payment_failed',
  'expired',
  'cancelled',
]);
