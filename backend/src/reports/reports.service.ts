import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { MenuCategoryId } from '../menu/menu.types';
import {
  REPORTS_REPOSITORY,
  type PaidOrder,
  type ReportsRepository,
  type UnpaidCounts,
} from './reports.repository';

/** Africa/Lagos is UTC+1 all year (no daylight saving), so WAT days have fixed UTC bounds. */
const WAT_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;
const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export interface SalesReport {
  /** WAT dates, both included. */
  from: string;
  to: string;
  timezone: 'Africa/Lagos';
  summary: {
    orders: number;
    /** What customers paid, delivery included. */
    salesKobo: number;
    foodSalesKobo: number;
    deliveryFeesKobo: number;
    /** Rounded to the nearest kobo; 0 when there were no orders. */
    averageOrderKobo: number;
    itemsSold: number;
    deliveryOrders: number;
    pickupOrders: number;
    /** Orders placed in the period that were never paid. */
    unpaid: UnpaidCounts;
  };
  /** Best sellers first: most sold, then highest sales, then name. */
  dishes: Array<{
    menuItemId: string;
    name: string;
    category: MenuCategoryId | null;
    retired: boolean;
    quantity: number;
    salesKobo: number;
    /** Paid orders that included the dish. */
    orders: number;
  }>;
  /** Dishes on the menu that sold nothing in the period, by name. */
  unsoldDishes: Array<{ menuItemId: string; name: string; category: MenuCategoryId }>;
  /** Chosen options (for example soup proteins), most chosen first within each group. */
  options: Array<{ groupName: string; name: string; quantity: number; extraSalesKobo: number }>;
  days: Array<{ date: string; orders: number; salesKobo: number }>;
  /** 0-23, WAT, by when the payment cleared. */
  hours: Array<{ hour: number; orders: number; salesKobo: number }>;
  weekdays: Array<{ weekday: Weekday; orders: number; salesKobo: number }>;
}

/** Start of a WAT calendar day, as a UTC instant. */
export function watDayStart(date: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - WAT_OFFSET_MS);
}

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

/** The WAT wall clock of an instant, read through UTC getters. */
const wat = (iso: string) => new Date(Date.parse(iso) + WAT_OFFSET_MS);
const dateOf = (instant: Date) => instant.toISOString().slice(0, 10);

const invalidRange = (message: string) =>
  new BadRequestException({ code: 'INVALID_DATE_RANGE', message });

const tally = <K>(map: Map<K, { orders: number; salesKobo: number }>, key: K, order: PaidOrder) => {
  const entry = map.get(key);
  if (entry) {
    entry.orders += 1;
    entry.salesKobo += order.totalKobo;
  }
};

/**
 * Sales reports for planning (AGENT.md 3.4, super_admin). A sale is an order whose payment
 * succeeded, counted on the WAT day and hour the payment cleared. Everything is added up here,
 * in integer kobo, so the reports do not depend on the database.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(REPORTS_REPOSITORY) private readonly repo: ReportsRepository) {}

  async sales(from: string, to: string): Promise<SalesReport> {
    if (!isCalendarDate(from) || !isCalendarDate(to)) {
      throw invalidRange('Choose real dates, written as YYYY-MM-DD.');
    }
    const start = watDayStart(from);
    const end = new Date(watDayStart(to).getTime() + DAY_MS);
    const dayCount = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    if (dayCount < 1) throw invalidRange('The end date must be on or after the start date.');
    if (dayCount > MAX_DAYS) throw invalidRange(`Choose at most ${MAX_DAYS} days.`);

    const [orders, unpaid, dishes] = await Promise.all([
      this.repo.paidOrders(start, end),
      this.repo.unpaidCounts(start, end),
      this.repo.dishes(),
    ]);
    const dishById = new Map(dishes.map((d) => [d.id, d]));

    const days = new Map<string, { orders: number; salesKobo: number }>();
    for (let i = 0; i < dayCount; i++) {
      days.set(dateOf(new Date(Date.parse(`${from}T00:00:00Z`) + i * DAY_MS)), {
        orders: 0,
        salesKobo: 0,
      });
    }
    const hours = new Map(
      Array.from({ length: 24 }, (_, h) => [h, { orders: 0, salesKobo: 0 }] as const),
    );
    const weekdays = new Map(WEEKDAYS.map((w) => [w, { orders: 0, salesKobo: 0 }] as const));
    const sold = new Map<
      string,
      { quantity: number; salesKobo: number; orders: Set<string>; name: string }
    >();
    const options = new Map<string, SalesReport['options'][number]>();

    for (const order of orders) {
      const local = wat(order.paidAt);
      tally(days, dateOf(local), order);
      tally(hours, local.getUTCHours(), order);
      // getUTCDay(): 0 = Sunday.
      tally(weekdays, WEEKDAYS[(local.getUTCDay() + 6) % 7], order);

      for (const l of order.lines) {
        const entry = sold.get(l.menuItemId) ?? {
          quantity: 0,
          salesKobo: 0,
          orders: new Set<string>(),
          name: l.name,
        };
        entry.quantity += l.quantity;
        entry.salesKobo += l.lineTotalKobo;
        entry.orders.add(order.orderId);
        sold.set(l.menuItemId, entry);

        for (const o of l.options) {
          const key = `${o.groupName}\u0000${o.name}`;
          const opt = options.get(key) ?? {
            groupName: o.groupName,
            name: o.name,
            quantity: 0,
            extraSalesKobo: 0,
          };
          opt.quantity += l.quantity;
          opt.extraSalesKobo += o.priceDeltaKobo * l.quantity;
          options.set(key, opt);
        }
      }
    }

    const sum = (pick: (o: PaidOrder) => number) => orders.reduce((s, o) => s + pick(o), 0);
    const salesKobo = sum((o) => o.totalKobo);

    return {
      from,
      to,
      timezone: 'Africa/Lagos',
      summary: {
        orders: orders.length,
        salesKobo,
        foodSalesKobo: sum((o) => o.subtotalKobo),
        deliveryFeesKobo: sum((o) => o.deliveryFeeKobo),
        averageOrderKobo: orders.length ? Math.round(salesKobo / orders.length) : 0,
        itemsSold: sum((o) => o.lines.reduce((s, l) => s + l.quantity, 0)),
        deliveryOrders: orders.filter((o) => o.fulfilment === 'delivery').length,
        pickupOrders: orders.filter((o) => o.fulfilment === 'pickup').length,
        unpaid,
      },
      dishes: [...sold.entries()]
        .map(([menuItemId, s]) => {
          const dish = dishById.get(menuItemId);
          return {
            menuItemId,
            name: dish?.name ?? s.name,
            category: dish?.category ?? null,
            retired: dish?.retired ?? true,
            quantity: s.quantity,
            salesKobo: s.salesKobo,
            orders: s.orders.size,
          };
        })
        .sort(
          (a, b) =>
            b.quantity - a.quantity || b.salesKobo - a.salesKobo || a.name.localeCompare(b.name),
        ),
      unsoldDishes: dishes
        .filter((d) => !d.retired && !sold.has(d.id))
        .map((d) => ({ menuItemId: d.id, name: d.name, category: d.category }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      options: [...options.values()].sort(
        (a, b) =>
          a.groupName.localeCompare(b.groupName) ||
          b.quantity - a.quantity ||
          a.name.localeCompare(b.name),
      ),
      days: [...days.entries()].map(([date, v]) => ({ date, ...v })),
      hours: [...hours.entries()].map(([hour, v]) => ({ hour, ...v })),
      weekdays: [...weekdays.entries()].map(([weekday, v]) => ({ weekday, ...v })),
    };
  }
}
