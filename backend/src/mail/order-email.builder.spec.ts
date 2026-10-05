import { InMemoryMenuRepository } from '../menu/in-memory-menu.repository';
import type { MenuItemRecord } from '../menu/menu.types';
import { InMemoryOrdersRepository } from '../orders/in-memory-orders.repository';
import type { SiteRepository } from '../site/site.repository';
import { InMemoryUsersRepository } from '../users/in-memory-users.repository';
import { OrderEmailBuilder, formatPhone } from './order-email.builder';

const item = (id: string, name: string, extra: Partial<MenuItemRecord> = {}): MenuItemRecord => ({
  id,
  slug: id,
  name,
  description: '',
  category: 'calabar_classics',
  priceKobo: 100000,
  isHouseSignature: false,
  isFreshJuice: false,
  isAvailable: true,
  imagePath: null,
  sortOrder: 0,
  optionGroups: [],
  ...extra,
});

const site = (phone: string | null = null, address: string | null = null): SiteRepository => ({
  getRestaurantInfo: () =>
    Promise.resolve({
      name: 'Mustard Seed Restaurant & Bar',
      phoneWhatsapp: phone,
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
        streetAddress: address,
        onlineOrderingEnabled: true,
      },
    ]),
});

async function setup(fulfilment: 'delivery' | 'pickup', siteRepo = site()) {
  const users = new InMemoryUsersRepository();
  const { user } = await users.upsertFromGoogle({
    sub: 'g',
    email: 'ekaette@example.com',
    emailVerified: true,
    firstName: 'Ekaette',
    fullName: 'Ekaette Bassey',
    avatarUrl: null,
  });
  const orders = new InMemoryOrdersRepository();
  const { orderId } = await orders.create(
    {
      userId: user.id,
      clientRequestId: 'r',
      trackingToken: 'T'.repeat(43),
      fulfilment,
      branchId: 'calabar',
      contactFullName: 'Ekaette Bassey',
      contactPhone: '+2348031234567',
      deliveryStreetAddress: fulfilment === 'delivery' ? '12 Marian Road' : null,
      deliveryCity: fulfilment === 'delivery' ? 'Calabar' : null,
      subtotalKobo: 380000,
      deliveryFeeKobo: fulfilment === 'delivery' ? 150000 : 0,
      totalKobo: fulfilment === 'delivery' ? 530000 : 380000,
      paymentExpiresAt: '2026-10-05T11:15:00.000Z',
      items: [
        {
          menuItemId: 'edikang',
          name: 'Edikang Ikong',
          unitPriceKobo: 100000,
          quantity: 2,
          lineTotalKobo: 200000,
          options: [],
        },
        {
          menuItemId: 'zobo',
          name: 'Zobo',
          unitPriceKobo: 80000,
          quantity: 1,
          lineTotalKobo: 80000,
          options: [],
        },
        {
          menuItemId: 'afang',
          name: 'Afang Soup',
          unitPriceKobo: 100000,
          quantity: 1,
          lineTotalKobo: 100000,
          options: [
            { optionId: 'o-beef', groupName: 'Soup protein', name: 'Beef', priceDeltaKobo: 0 },
            { optionId: 'o-egg', groupName: 'Extras', name: 'Egg', priceDeltaKobo: 0 },
          ],
        },
      ],
    },
    'c',
  );
  orders.patch(orderId, {
    status: 'paid',
    orderNumber: 42,
    estimatedReadyAt: '2026-10-05T18:45:00.000Z',
    payment: {
      reference: 'MS0042-x',
      authorizationUrl: 'x',
      status: 'success',
      channel: 'bank_transfer',
      paidAt: '2026-10-05T17:55:00.000Z',
    },
  });
  const menu = new InMemoryMenuRepository([
    item('edikang', 'Edikang Ikong', { isHouseSignature: true }),
    item('zobo', 'Zobo', { isFreshJuice: true, category: 'drinks' }),
    item('afang', 'Afang Soup'),
  ]);
  const builder = new OrderEmailBuilder(orders, users, menu, siteRepo, {
    FRONTEND_BASE_URL: 'https://mustardseed.ng',
  });
  return { builder, orderId };
}

describe('OrderEmailBuilder', () => {
  it('builds the delivery confirmation from the paid order', async () => {
    const { builder, orderId } = await setup('delivery');
    const { to, data } = await builder.build(orderId);
    expect(to).toBe('ekaette@example.com');
    expect(data).toMatchObject({
      firstName: 'Ekaette',
      orderNumber: '#MS-0042',
      fulfilment: 'delivery',
      etaLabel: '7:45pm',
      trackingUrl: `https://mustardseed.ng/track/${'T'.repeat(43)}`,
      subtotalKobo: 380000,
      deliveryFeeKobo: 150000,
      totalKobo: 530000,
      deliveryArea: 'Calabar',
      paymentChannel: 'Bank transfer',
      paidAt: '5 Oct 2026, 6:55pm',
      customer: { fullName: 'Ekaette Bassey', phone: '+234 803 123 4567' },
      deliveryAddress: {
        streetAddress: '12 Marian Road',
        city: 'Calabar',
        state: 'Cross River State',
      },
      pickupAddress: null,
      helpPhone: '[PHONE / WHATSAPP]',
      hoursLabel: '8am – 11pm',
      siteUrl: 'https://mustardseed.ng',
      siteDomain: 'mustardseed.ng',
      assetBaseUrl: 'https://mustardseed.ng/email',
    });
    expect(data.items).toEqual([
      { quantity: 2, name: 'Edikang Ikong', note: 'House signature', lineTotalKobo: 200000 },
      { quantity: 1, name: 'Zobo', note: 'Fresh, no preservatives', lineTotalKobo: 80000 },
      // The chosen options are the note (AGENT.md section 14), e.g. "Beef · Egg".
      { quantity: 1, name: 'Afang Soup', note: 'Beef · Egg', lineTotalKobo: 100000 },
    ]);
  });

  it('builds the pickup variant with the branch address and real phone once supplied', async () => {
    const { builder, orderId } = await setup('pickup', site('+2348000000000', '5 Example Street'));
    const { data } = await builder.build(orderId);
    expect(data.deliveryAddress).toBeNull();
    expect(data.pickupAddress).toEqual({
      name: 'Mustard Seed Restaurant & Bar',
      streetAddress: '5 Example Street',
      city: 'Calabar',
      state: 'Cross River State',
    });
    expect(data.helpPhone).toBe('+234 800 000 0000');
  });

  it('uses the address placeholder for pickup until it is supplied', async () => {
    const { builder, orderId } = await setup('pickup');
    expect((await builder.build(orderId)).data.pickupAddress?.streetAddress).toBe(
      '[CALABAR ADDRESS]',
    );
  });

  it('refuses to build for an order that is missing or not paid', async () => {
    const { builder } = await setup('delivery');
    await expect(builder.build('nope')).rejects.toThrow(/not found/);
  });
});

describe('formatPhone', () => {
  it.each([
    ['+2348031234567', '+234 803 123 4567'],
    ['+44 20 7946 0000', '+44 20 7946 0000'],
  ])('%s → %s', (input, expected) => expect(formatPhone(input)).toBe(expected));
});
