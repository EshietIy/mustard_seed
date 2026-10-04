import { randomUUID } from 'node:crypto';
import type { NewOrder, OrdersRepository } from './orders.repository';
import type { AuditEvent, OrderRecord } from './orders.types';

/** In-memory OrdersRepository for unit tests. */
export class InMemoryOrdersRepository implements OrdersRepository {
  private readonly orders = new Map<string, OrderRecord & { clientRequestId: string }>();
  readonly audit: AuditEvent[] = [];
  private sequence = 0;

  all(): OrderRecord[] {
    return [...this.orders.values()];
  }

  async create(
    order: NewOrder,
    correlationId: string,
  ): Promise<{ orderId: string; created: boolean }> {
    const existing = await this.findIdByClientRequest(order.userId, order.clientRequestId);
    if (existing) return { orderId: existing, created: false };
    const id = randomUUID();
    this.orders.set(id, {
      id,
      orderNumber: ++this.sequence,
      status: 'awaiting_payment',
      createdAt: new Date().toISOString(),
      payment: null,
      estimatedReadyAt: null,
      ...order,
    });
    this.audit.push({
      event: 'order.created',
      outcome: 'SUCCESS',
      userId: order.userId,
      orderId: id,
      amountKobo: order.totalKobo,
      toStatus: 'awaiting_payment',
      correlationId,
    });
    return { orderId: id, created: true };
  }

  /** Test helper: change an order directly (status, payment). */
  patch(id: string, changes: Partial<OrderRecord>): void {
    const order = this.orders.get(id);
    if (order) this.orders.set(id, { ...order, ...changes });
  }

  findById(id: string): Promise<OrderRecord | null> {
    return Promise.resolve(this.orders.get(id) ?? null);
  }

  findByTrackingToken(token: string): Promise<OrderRecord | null> {
    return Promise.resolve(this.all().find((o) => o.trackingToken === token) ?? null);
  }

  findIdByClientRequest(userId: string, clientRequestId: string): Promise<string | null> {
    const found = [...this.orders.values()].find(
      (o) => o.userId === userId && o.clientRequestId === clientRequestId,
    );
    return Promise.resolve(found?.id ?? null);
  }

  recordAudit(event: AuditEvent): Promise<void> {
    this.audit.push(event);
    return Promise.resolve();
  }
}
