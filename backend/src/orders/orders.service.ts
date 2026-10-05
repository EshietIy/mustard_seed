import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { MENU_REPOSITORY, type MenuRepository } from '../menu/menu.repository';
import { SITE_REPOSITORY, type SiteRepository } from '../site/site.repository';
import { formatOrderNumber } from './order-number';
import { ORDERS_REPOSITORY, type OrdersRepository } from './orders.repository';
import type { OrderItemRecord, OrderRecord, OrderStatus } from './orders.types';
import { normalizeNigerianPhone } from './phone';
import {
  buildQuote,
  type Fulfilment,
  type Quote,
  type QuoteInput,
  type QuoteProblemCode,
} from './pricing';

export interface PlaceOrderInput extends QuoteInput {
  contact: { fullName: string; phone: string };
  delivery?: { streetAddress: string; city?: string };
  /** The total the customer was shown; the order is refused if the server total differs. */
  expectedTotalKobo: number;
  /** One per checkout attempt; a retried submit returns the same order. */
  clientRequestId: string;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfilment: Fulfilment;
  branch: { id: string; city: string };
  items: OrderItemRecord[];
  subtotalKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  currency: 'NGN';
  contact: { fullName: string; phone: string };
  delivery: { streetAddress: string; city: string } | null;
  createdAt: string;
  paymentExpiresAt: string;
  estimatedReadyAt: string | null;
  payment: { status: string; channel: string | null; paidAt: string | null } | null;
}

/** What a tracking-link holder sees: the customer view without internal ids. */
export type TrackedOrderView = Omit<OrderView, 'id'>;

/** randomBytes(32) as base64url (see place()). */
const TRACKING_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const orderNotFound = () =>
  new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'We could not find that order.' });

/** Most important first: the code reported when several problems apply. */
const PROBLEM_PRIORITY: QuoteProblemCode[] = [
  'ORDERING_CLOSED',
  'BRANCH_NOT_ACCEPTING_ORDERS',
  'EMPTY_CART',
  'ITEM_NOT_FOUND',
  'ITEM_UNAVAILABLE',
  'ITEM_PRICE_UNAVAILABLE',
  'OPTION_NOT_OFFERED',
  'OPTION_UNAVAILABLE',
  'OPTION_REQUIRED',
  'OPTION_TOO_MANY',
];

const fieldError = (field: string, message: string) =>
  new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Some fields are invalid.',
    details: [{ field, messages: [message] }],
  });

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(MENU_REPOSITORY) private readonly menu: MenuRepository,
    @Inject(SITE_REPOSITORY) private readonly site: SiteRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'PAYMENT_WINDOW_MINUTES'>,
  ) {}

  async quote(input: QuoteInput): Promise<Quote> {
    const [menu, info, branches] = await Promise.all([
      this.menu.listItems(),
      this.site.getRestaurantInfo(),
      this.site.listBranches(),
    ]);
    if (!info) throw new Error('restaurant_info row is missing');
    return buildQuote({ menu, info, branches, now: this.clock() }, input);
  }

  async place(
    user: AuthenticatedUser,
    input: PlaceOrderInput,
    correlationId: string,
  ): Promise<{ order: OrderView; created: boolean }> {
    // A retried submit returns the order already placed, whatever has changed since.
    const existing = await this.orders.findIdByClientRequest(user.id, input.clientRequestId);
    if (existing) return { order: await this.view(existing), created: false };

    this.validateShape(input);
    const phone = normalizeNigerianPhone(input.contact.phone);
    if (!phone)
      throw fieldError('contact.phone', 'Enter a valid Nigerian phone number, e.g. 0803 123 4567');

    let quote: Quote | undefined;
    try {
      const info = await this.site.getRestaurantInfo();
      if (!info) throw new Error('restaurant_info row is missing');
      const deliveryCity =
        input.fulfilment === 'delivery' ? this.deliveryCity(input, info.deliveryArea) : null;

      quote = await this.quote(input);
      const problem = PROBLEM_PRIORITY.map((code) =>
        quote?.problems.find((p) => p.code === code),
      ).find(Boolean);
      if (problem) {
        throw new UnprocessableEntityException({
          code: problem.code,
          message: problem.message,
          details: quote.problems,
        });
      }
      if (quote.totalKobo === null || quote.subtotalKobo === null) {
        throw new Error('quote without a total despite no problems');
      }
      if (quote.totalKobo !== input.expectedTotalKobo) {
        throw new ConflictException({
          code: 'PRICE_CHANGED',
          message: 'Prices have changed since you started checkout. Please review your order.',
          details: {
            subtotalKobo: quote.subtotalKobo,
            deliveryFeeKobo: quote.deliveryFeeKobo,
            totalKobo: quote.totalKobo,
          },
        });
      }

      const { orderId, created } = await this.orders.create(
        {
          userId: user.id,
          clientRequestId: input.clientRequestId,
          trackingToken: randomBytes(32).toString('base64url'),
          fulfilment: input.fulfilment,
          branchId: input.branchId,
          contactFullName: input.contact.fullName.trim(),
          contactPhone: phone,
          deliveryStreetAddress: input.delivery?.streetAddress.trim() ?? null,
          deliveryCity,
          subtotalKobo: quote.subtotalKobo,
          deliveryFeeKobo: quote.deliveryFeeKobo,
          totalKobo: quote.totalKobo,
          paymentExpiresAt: new Date(
            this.clock().getTime() + this.config.PAYMENT_WINDOW_MINUTES * 60_000,
          ).toISOString(),
          items: quote.lines.map((l) => ({
            menuItemId: l.menuItemId,
            name: l.name,
            unitPriceKobo: l.unitPriceKobo as number,
            quantity: l.quantity,
            lineTotalKobo: l.lineTotalKobo as number,
            options: l.options.map((o) => ({
              optionId: o.id,
              groupName: o.groupName,
              name: o.name,
              priceDeltaKobo: o.priceDeltaKobo,
            })),
          })),
        },
        correlationId,
      );
      return { order: await this.view(orderId), created };
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() < 500) {
        await this.auditFailure(user, err, quote, correlationId);
      }
      throw err;
    }
  }

  async getForUser(user: AuthenticatedUser, id: string): Promise<OrderView> {
    const order = await this.orders.findById(id);
    // 404 (not 403) for someone else's order, so ids can't be probed.
    if (!order || order.userId !== user.id) throw orderNotFound();
    return this.toView(order);
  }

  /** Public status page: the unguessable token is the credential. */
  async track(token: string): Promise<TrackedOrderView> {
    const order = TRACKING_TOKEN.test(token) ? await this.orders.findByTrackingToken(token) : null;
    if (!order) throw orderNotFound();
    return this.toTrackedView(order);
  }

  private validateShape(input: PlaceOrderInput): void {
    // A line is an item plus its chosen options; the same combination twice is one line.
    const keys = input.items.map((i) =>
      [i.menuItemId, ...[...(i.optionIds ?? [])].sort()].join('|'),
    );
    if (new Set(keys).size !== keys.length) {
      throw fieldError(
        'items',
        'Each item with the same choices may appear only once; change its quantity instead',
      );
    }
    if (input.fulfilment === 'delivery' && !input.delivery) {
      throw fieldError('delivery.streetAddress', 'Enter a delivery address');
    }
    if (input.fulfilment === 'pickup' && input.delivery) {
      throw fieldError('delivery', 'Leave out the delivery address for pickup');
    }
  }

  private deliveryCity(input: PlaceOrderInput, area: string): string {
    const city = input.delivery?.city?.trim();
    if (city && city.toLowerCase() !== area.toLowerCase()) {
      throw new UnprocessableEntityException({
        code: 'DELIVERY_AREA_NOT_SERVED',
        message: `We deliver within ${area} only. Choose pickup, or use a ${area} address.`,
      });
    }
    return area;
  }

  private async auditFailure(
    user: AuthenticatedUser,
    err: HttpException,
    quote: Quote | undefined,
    correlationId: string,
  ): Promise<void> {
    const body = err.getResponse() as { code?: string };
    try {
      await this.orders.recordAudit({
        event: 'order.create',
        outcome: 'FAILED',
        userId: user.id,
        errorCode: body.code ?? null,
        amountKobo: quote?.totalKobo ?? null,
        correlationId,
        details: { problems: quote?.problems.map((p) => p.code) ?? [] },
      });
    } catch (auditErr) {
      // Never let the audit trail hide the real error from the customer.
      this.logger.error(`Failed to record order failure audit: ${String(auditErr)}`);
    }
  }

  /** The customer-facing view of any order (callers check ownership). */
  async viewById(id: string): Promise<OrderView> {
    return this.view(id);
  }

  private async view(id: string): Promise<OrderView> {
    const order = await this.orders.findById(id);
    if (!order) throw new Error(`order ${id} vanished after creation`);
    return this.toView(order);
  }

  private async toView(order: OrderRecord): Promise<OrderView> {
    return { id: order.id, ...(await this.toTrackedView(order)) };
  }

  private async toTrackedView(order: OrderRecord): Promise<TrackedOrderView> {
    const branches = await this.site.listBranches();
    const branch = branches.find((b) => b.id === order.branchId);
    return {
      orderNumber: formatOrderNumber(order.orderNumber),
      status: order.status,
      fulfilment: order.fulfilment,
      branch: { id: order.branchId, city: branch?.city ?? order.branchId },
      items: order.items,
      subtotalKobo: order.subtotalKobo,
      deliveryFeeKobo: order.deliveryFeeKobo,
      totalKobo: order.totalKobo,
      currency: 'NGN',
      contact: { fullName: order.contactFullName, phone: order.contactPhone },
      delivery:
        order.deliveryStreetAddress && order.deliveryCity
          ? { streetAddress: order.deliveryStreetAddress, city: order.deliveryCity }
          : null,
      createdAt: order.createdAt,
      paymentExpiresAt: order.paymentExpiresAt,
      estimatedReadyAt: order.estimatedReadyAt,
      payment: order.payment
        ? {
            status: order.payment.status,
            channel: order.payment.channel,
            paidAt: order.payment.paidAt,
          }
        : null,
    };
  }
}
