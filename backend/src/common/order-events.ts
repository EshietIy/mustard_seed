import { EventEmitter } from 'node:events';

/** In-process domain events, so modules can react without depending on each other. */
export const ORDER_EVENTS = Symbol('ORDER_EVENTS');

export interface OrderPaidEvent {
  orderId: string;
}

export type OrderEvents = EventEmitter<{ 'order.paid': [OrderPaidEvent] }>;

export function createOrderEvents(): OrderEvents {
  return new EventEmitter<{ 'order.paid': [OrderPaidEvent] }>();
}
