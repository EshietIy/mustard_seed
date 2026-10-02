import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { InMemoryMenuRepository } from '../menu/in-memory-menu.repository';
import type { MenuItemRecord } from '../menu/menu.types';
import type { SiteRepository } from '../site/site.repository';
import { InMemoryOrdersRepository } from './in-memory-orders.repository';
import { OrdersService, type PlaceOrderInput } from './orders.service';

const EDIKANG = '11111111-1111-4111-8111-111111111111';
const ZOBO = '22222222-2222-4222-8222-222222222222';
const AFANG = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';

const item = (
  id: string,
  name: string,
  priceKobo: number | null,
  isAvailable = true,
): MenuItemRecord => ({
  id,
  slug: name.toLowerCase().replace(/\W+/g, '-'),
  name,
  description: '',
  category: 'calabar_classics',
  priceKobo,
  isHouseSignature: false,
  isFreshJuice: false,
  isAvailable,
  imagePath: null,
  sortOrder: 0,
});

const site: SiteRepository = {
  getRestaurantInfo: () =>
    Promise.resolve({
      name: 'Mustard Seed Restaurant & Bar',
      phoneWhatsapp: null,
      opensAt: '08:00:00',
      closesAt: '23:00:00',
      onlineOrdersCloseAt: '22:30:00',
      timezone: 'Africa/Lagos',
      deliveryFeeKobo: 150000,
      deliveryArea: 'Calabar',
    }),
  listBranches: () =>
    Promise.resolve([
      {
        id: 'calabar',
        city: 'Calabar',
        state: 'Cross River State',
        role: 'headquarters',
        streetAddress: null,
        onlineOrderingEnabled: true,
      },
      {
        id: 'uyo',
        city: 'Uyo',
        state: 'Akwa Ibom State',
        role: 'branch',
        streetAddress: 'x',
        onlineOrderingEnabled: false,
      },
    ]),
};

const user = { id: 'user-1', email: 'ada@example.com', role: 'customer' } as AuthenticatedUser;

function setup(now = '2026-10-04T12:00:00+01:00') {
  const menu = new InMemoryMenuRepository([
    item(EDIKANG, 'Edikang Ikong', 450000),
    item(ZOBO, 'Zobo', 80000),
    item(AFANG, 'Afang Soup', 400000, false),
  ]);
  const orders = new InMemoryOrdersRepository();
  const service = new OrdersService(menu, site, orders, () => new Date(now), {
    PAYMENT_WINDOW_MINUTES: 15,
  });
  return { service, orders };
}

const delivery = (overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  fulfilment: 'delivery',
  branchId: 'calabar',
  items: [
    { menuItemId: EDIKANG, quantity: 2 },
    { menuItemId: ZOBO, quantity: 1 },
  ],
  contact: { fullName: 'Ada Obi', phone: '+2348031234567' },
  delivery: { streetAddress: '12 Marian Road' },
  expectedTotalKobo: 450000 * 2 + 80000 + 150000,
  clientRequestId: REQUEST,
  ...overrides,
});

const codeOf = (err: unknown) => ((err as HttpException).getResponse() as { code: string }).code;

describe('OrdersService.quote', () => {
  it('prices the cart from the menu', async () => {
    const quote = await setup().service.quote({
      fulfilment: 'pickup',
      branchId: 'calabar',
      items: [{ menuItemId: ZOBO, quantity: 2 }],
    });
    expect(quote.totalKobo).toBe(160000);
    expect(quote.canPlaceOrder).toBe(true);
  });
});

describe('OrdersService.place', () => {
  it('creates a delivery order awaiting payment, with server-computed totals and an audit record', async () => {
    const { service, orders } = setup();
    const { order, created } = await service.place(user, delivery(), 'corr-1');
    expect(created).toBe(true);
    expect(order).toMatchObject({
      orderNumber: '#MS-0001',
      status: 'awaiting_payment',
      fulfilment: 'delivery',
      branch: { id: 'calabar', city: 'Calabar' },
      subtotalKobo: 980000,
      deliveryFeeKobo: 150000,
      totalKobo: 1130000,
      currency: 'NGN',
      contact: { fullName: 'Ada Obi', phone: '+2348031234567' },
      delivery: { streetAddress: '12 Marian Road', city: 'Calabar' },
    });
    expect(order.items).toEqual([
      {
        menuItemId: EDIKANG,
        name: 'Edikang Ikong',
        unitPriceKobo: 450000,
        quantity: 2,
        lineTotalKobo: 900000,
      },
      { menuItemId: ZOBO, name: 'Zobo', unitPriceKobo: 80000, quantity: 1, lineTotalKobo: 80000 },
    ]);
    expect(order.paymentExpiresAt).toBe('2026-10-04T11:15:00.000Z');
    expect(order.payment).toBeNull();
    const stored = orders.all()[0];
    expect(stored?.userId).toBe('user-1');
    expect(stored?.trackingToken).toMatch(/^[\w-]{43}$/);
    expect(orders.audit).toContainEqual(
      expect.objectContaining({
        event: 'order.created',
        outcome: 'SUCCESS',
        toStatus: 'awaiting_payment',
        correlationId: 'corr-1',
      }),
    );
  });

  it('creates a pickup order with no delivery fee or address', async () => {
    const { service } = setup();
    const { order } = await service.place(
      user,
      delivery({ fulfilment: 'pickup', delivery: undefined, expectedTotalKobo: 980000 }),
      'c',
    );
    expect(order).toMatchObject({ deliveryFeeKobo: 0, totalKobo: 980000, delivery: null });
  });

  it('accepts an explicit Calabar city in any case', async () => {
    const { service } = setup();
    const { order } = await service.place(
      user,
      delivery({ delivery: { streetAddress: '1 Road', city: ' calabar ' } }),
      'c',
    );
    expect(order.delivery?.city).toBe('Calabar');
  });

  it('returns the same order when the same checkout is submitted twice', async () => {
    const { service, orders } = setup();
    const first = await service.place(user, delivery(), 'c');
    const again = await service.place(user, delivery(), 'c');
    expect(again.created).toBe(false);
    expect(again.order.id).toBe(first.order.id);
    expect(orders.all()).toHaveLength(1);
  });

  it('replays even if the shop has since closed', async () => {
    const open = setup();
    const first = await open.service.place(user, delivery(), 'c');
    const closed = new OrdersService(
      new InMemoryMenuRepository([
        item(EDIKANG, 'Edikang Ikong', 450000),
        item(ZOBO, 'Zobo', 80000),
      ]),
      site,
      open.orders,
      () => new Date('2026-10-04T22:45:00+01:00'),
      { PAYMENT_WINDOW_MINUTES: 15 },
    );
    await expect(closed.place(user, delivery(), 'c')).resolves.toMatchObject({
      created: false,
      order: { id: first.order.id },
    });
  });

  it('rejects a delivery outside Calabar (422) and audits the failure', async () => {
    const { service, orders } = setup();
    const err = await service
      .place(user, delivery({ delivery: { streetAddress: '1 Road', city: 'Uyo' } }), 'c')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(codeOf(err)).toBe('DELIVERY_AREA_NOT_SERVED');
    expect(orders.all()).toHaveLength(0);
    expect(orders.audit).toContainEqual(
      expect.objectContaining({
        event: 'order.create',
        outcome: 'FAILED',
        errorCode: 'DELIVERY_AREA_NOT_SERVED',
        userId: 'user-1',
      }),
    );
  });

  it('requires an address for delivery and none for pickup (400)', async () => {
    const { service } = setup();
    await expect(
      service.place(user, delivery({ delivery: undefined }), 'c'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.place(user, delivery({ fulfilment: 'pickup', expectedTotalKobo: 980000 }), 'c'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate items in one order (400)', async () => {
    const { service } = setup();
    await expect(
      service.place(
        user,
        delivery({
          items: [
            { menuItemId: ZOBO, quantity: 1 },
            { menuItemId: ZOBO, quantity: 2 },
          ],
        }),
        'c',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid phone number (400)', async () => {
    const { service } = setup();
    await expect(
      service.place(user, delivery({ contact: { fullName: 'Ada', phone: '12345' } }), 'c'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['an empty cart', { items: [] }, 'EMPTY_CART'],
    ['a sold-out item', { items: [{ menuItemId: AFANG, quantity: 1 }] }, 'ITEM_UNAVAILABLE'],
    [
      'an unknown item',
      { items: [{ menuItemId: '55555555-5555-4555-8555-555555555555', quantity: 1 }] },
      'ITEM_NOT_FOUND',
    ],
    ['the Uyo branch', { branchId: 'uyo' }, 'BRANCH_NOT_ACCEPTING_ORDERS'],
  ])('rejects %s with 422', async (_label, overrides, code) => {
    const { service, orders } = setup();
    const err = await service
      .place(user, delivery(overrides as Partial<PlaceOrderInput>), 'c')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(codeOf(err)).toBe(code);
    expect(orders.all()).toHaveLength(0);
  });

  it('rejects after the 10:30pm cut-off with ORDERING_CLOSED', async () => {
    const { service } = setup('2026-10-04T22:31:00+01:00');
    const err = await service.place(user, delivery(), 'c').catch((e: unknown) => e);
    expect(codeOf(err)).toBe('ORDERING_CLOSED');
  });

  it('rejects a total that no longer matches the server (409) and returns the new totals', async () => {
    const { service, orders } = setup();
    const err = await service
      .place(user, delivery({ expectedTotalKobo: 999 }), 'c')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: 'PRICE_CHANGED',
      details: { subtotalKobo: 980000, deliveryFeeKobo: 150000, totalKobo: 1130000 },
    });
    expect(orders.all()).toHaveLength(0);
    expect(orders.audit).toContainEqual(
      expect.objectContaining({
        outcome: 'FAILED',
        errorCode: 'PRICE_CHANGED',
        amountKobo: 1130000,
      }),
    );
  });

  it('still rejects the order if writing the failure audit fails', async () => {
    const { service, orders } = setup();
    jest.spyOn(orders, 'recordAudit').mockRejectedValue(new Error('db down'));
    await expect(service.place(user, delivery({ items: [] }), 'c')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

describe('OrdersService.getForUser', () => {
  it('returns the order to its owner and 404s for anyone else', async () => {
    const { service } = setup();
    const { order } = await service.place(user, delivery(), 'c');
    await expect(service.getForUser(user, order.id)).resolves.toMatchObject({ id: order.id });
    const other = { ...user, id: 'user-2' };
    await expect(service.getForUser(other, order.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getForUser(user, '66666666-6666-4666-8666-666666666666'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
