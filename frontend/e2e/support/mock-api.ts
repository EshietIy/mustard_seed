import type { Page, Route } from '@playwright/test';

export const API = 'http://api.test/api/v1';

const item = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug: id,
  name,
  description: `${name} description.`,
  priceKobo: null,
  isHouseSignature: false,
  isFreshJuice: false,
  isAvailable: true,
  image: null,
  ...extra,
});

export function menuFixture() {
  return {
    categories: [
      {
        id: 'calabar_classics',
        label: 'Calabar classics',
        items: [
          item('edikang-ikong', 'Edikang Ikong', { isHouseSignature: true }),
          item('afang-soup', 'Afang Soup', { priceKobo: 450000 }),
          item('atama-soup', 'Atama Soup', { isAvailable: false }),
        ],
      },
      { id: 'swallow_sides', label: 'Swallow & sides', items: [] },
      { id: 'continental', label: 'Continental', items: [] },
      {
        id: 'drinks',
        label: 'Drinks',
        items: [
          item('zobo', 'Zobo', { isFreshJuice: true, description: '', priceKobo: 80000 }),
          item('pineapple-ginger', 'Pineapple & ginger', { isFreshJuice: true, description: '' }),
          item('watermelon', 'Watermelon', { isFreshJuice: true, description: '' }),
        ],
      },
    ],
  };
}

export function siteFixture() {
  return {
    name: 'Mustard Seed Restaurant & Bar',
    phoneWhatsapp: null,
    hours: {
      opensAt: '08:00',
      closesAt: '23:00',
      onlineOrdersCloseAt: '22:30',
      timezone: 'Africa/Lagos',
    },
    delivery: { feeKobo: 150000, area: 'Calabar' },
    branches: [
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
        streetAddress: '97 Tunde Ukpehe (Mitama), Uyo',
        onlineOrderingEnabled: false,
      },
    ],
  };
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export const SIGNED_IN_USER = {
  id: 'u-1',
  email: 'ekaette@example.com',
  firstName: 'Ekaette',
  fullName: 'Ekaette Bassey',
  avatarUrl: null,
  role: 'customer',
};

/**
 * Stand-in for Google Identity Services: renders a button that "returns" a credential, so
 * sign-in journeys run without a Google account or network access.
 */
const FAKE_GIS = `
window.google = { accounts: { id: {
  initialize(cfg) { window.__gisConfig = cfg; },
  renderButton(el) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Continue with Google (test)';
    b.onclick = () => window.__gisConfig.callback({ credential: 'fake-google-credential' });
    el.appendChild(b);
  },
  cancel() {}, disableAutoSelect() {}
} } };`;

interface QuoteRequest {
  fulfilment: 'delivery' | 'pickup';
  items: Array<{ menuItemId: string; quantity: number }>;
}

let placedOrder: unknown = null;

/** Prices a cart from the fixture menu, like the real quote endpoint. */
export function quoteFor(body: QuoteRequest, open: boolean) {
  const all = menuFixture().categories.flatMap((c) => c.items);
  const lines = body.items.map(({ menuItemId, quantity }) => {
    const found = all.find((i) => i.id === menuItemId);
    const price = (found?.priceKobo as number | null | undefined) ?? null;
    return {
      menuItemId,
      name: found?.name ?? '?',
      unitPriceKobo: price,
      quantity,
      lineTotalKobo: price === null ? null : price * quantity,
      isAvailable: true,
    };
  });
  const priced = lines.every((l) => l.lineTotalKobo !== null);
  const subtotalKobo = priced ? lines.reduce((s, l) => s + (l.lineTotalKobo ?? 0), 0) : null;
  const deliveryFeeKobo = body.fulfilment === 'delivery' ? 150000 : 0;
  const problems = [
    ...(open
      ? []
      : [
          {
            code: 'ORDERING_CLOSED',
            message: 'Online orders are open 8am – 10:30pm. Please come back then.',
          },
        ]),
    ...lines
      .filter((l) => l.unitPriceKobo === null)
      .map((l) => ({
        code: 'ITEM_PRICE_UNAVAILABLE',
        menuItemId: l.menuItemId,
        message: `${l.name} can’t be ordered online yet.`,
      })),
  ];
  return {
    lines,
    subtotalKobo,
    deliveryFeeKobo,
    totalKobo: subtotalKobo === null ? null : subtotalKobo + deliveryFeeKobo,
    ordering: { open, opensAt: '08:00', onlineOrdersCloseAt: '22:30', timezone: 'Africa/Lagos' },
    problems,
    canPlaceOrder: problems.length === 0 && subtotalKobo !== null,
  };
}

export interface MockOptions {
  paymentMode?: 'simulated' | 'live';
  /** The session the API reports on load (default: signed out). */
  session?: typeof SIGNED_IN_USER | null;
  signIn?: { status: number; body: unknown };
  googleScript?: 'ok' | 'blocked';
  /** Ordering window reported by the quote endpoint. */
  orderingOpen?: boolean;
  placeOrder?: { status: number; body: unknown };
  /** What the server reports when the customer returns from the payment page. */
  paymentResult?: 'paid' | 'payment_failed' | 'pending-then-paid' | 'verify-down';
  startPayment?: { status: number; body: unknown };
  menu?: { status: number; body: unknown } | 'abort';
  site?: { status: number; body: unknown };
  config?: { status: number; body: unknown } | 'abort';
  /** Successive answers for GET /orders/track/*; the last one repeats (default: 404). */
  track?: Array<{ status: number; body: unknown }>;
}

/** Mocks every API endpoint the landing page calls. Override per test for sad paths. */
export async function mockApi(page: Page, options: MockOptions = {}): Promise<void> {
  await page.route(`${API}/config/public`, (route) =>
    options.config === 'abort'
      ? route.abort('internetdisconnected')
      : json(
          route,
          options.config?.status ?? 200,
          options.config?.body ?? {
            paymentMode: options.paymentMode ?? 'live',
            googleClientId: 'test-client.apps.googleusercontent.com',
          },
        ),
  );
  await page.route(`${API}/auth/me`, (route) =>
    options.session
      ? json(route, 200, { user: options.session })
      : json(route, 401, {
          error: { code: 'UNAUTHORIZED', message: 'Please sign in to continue.' },
        }),
  );
  await page.route(`${API}/auth/google`, (route) =>
    json(route, options.signIn?.status ?? 200, options.signIn?.body ?? { user: SIGNED_IN_USER }),
  );
  await page.route(`${API}/auth/logout`, (route) => route.fulfill({ status: 204 }));
  await page.route(`${API}/orders/quote`, (route) => {
    const body = route.request().postDataJSON() as QuoteRequest;
    return json(route, 200, quoteFor(body, options.orderingOpen ?? true));
  });
  await page.route(`${API}/orders`, (route) => {
    if (options.placeOrder) return json(route, options.placeOrder.status, options.placeOrder.body);
    const body = route.request().postDataJSON() as QuoteRequest & {
      contact: { fullName: string; phone: string };
      delivery?: { streetAddress: string };
    };
    const quote = quoteFor(body, true);
    placedOrder = {
      id: 'order-1',
      orderNumber: '#MS-0001',
      status: 'awaiting_payment',
      fulfilment: body.fulfilment,
      branch: { id: 'calabar', city: 'Calabar' },
      items: quote.lines,
      subtotalKobo: quote.subtotalKobo,
      deliveryFeeKobo: quote.deliveryFeeKobo,
      totalKobo: quote.totalKobo,
      currency: 'NGN',
      contact: { fullName: body.contact.fullName, phone: '+2348031234567' },
      delivery: body.delivery
        ? { streetAddress: body.delivery.streetAddress, city: 'Calabar' }
        : null,
      createdAt: '2026-10-05T11:00:00Z',
      paymentExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      payment: null,
    };
    return json(route, 201, placedOrder);
  });
  await page.route(`${API}/orders/order-1`, (route) => json(route, 200, placedOrder));
  const track = options.track ?? [
    { status: 404, body: { error: { code: 'ORDER_NOT_FOUND', message: 'Not found' } } },
  ];
  let trackCalls = 0;
  await page.route(`${API}/orders/track/*`, (route) => {
    const answer = track[Math.min(trackCalls++, track.length - 1)];
    return json(route, answer.status, answer.body);
  });
  await page.route(`${API}/orders/order-1/payments`, (route) =>
    options.startPayment
      ? json(route, options.startPayment.status, options.startPayment.body)
      : json(route, 201, {
          reference: 'MS0001-test',
          authorizationUrl: 'https://pay.test/checkout/abc',
        }),
  );
  // Stand-in for Paystack's hosted page: one link back to the site, as Paystack redirects.
  await page.route('https://pay.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><title>TEST PAYMENT</title><h1>TEST PAYMENT</h1>
        <a href="${new URL(page.url()).origin}/orders/order-1?reference=MS0001-test&trxref=MS0001-test">Pay successfully</a>`,
    }),
  );
  let verifyCalls = 0;
  await page.route(`${API}/payments/verify`, (route) => {
    verifyCalls += 1;
    const base = placedOrder as Record<string, unknown>;
    switch (options.paymentResult ?? 'paid') {
      case 'verify-down':
        return verifyCalls === 1
          ? json(route, 503, { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'ref-verify' } })
          : json(route, 200, { ...base, status: 'paid' });
      case 'payment_failed':
        return json(route, 200, {
          ...base,
          status: 'payment_failed',
          payment: { status: 'failed', channel: null, paidAt: null },
        });
      case 'pending-then-paid':
        return json(
          route,
          200,
          verifyCalls < 2
            ? { ...base, payment: { status: 'ongoing', channel: null, paidAt: null } }
            : { ...base, status: 'paid' },
        );
      default:
        return json(route, 200, {
          ...base,
          status: 'paid',
          payment: { status: 'success', channel: 'card', paidAt: '2026-10-05T11:05:00Z' },
        });
    }
  });
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    options.googleScript === 'blocked'
      ? route.abort('blockedbyclient')
      : route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_GIS }),
  );
  await page.route(`${API}/menu`, (route) =>
    options.menu === 'abort'
      ? route.abort('internetdisconnected')
      : json(route, options.menu?.status ?? 200, options.menu?.body ?? menuFixture()),
  );
  await page.route(`${API}/site`, (route) =>
    json(route, options.site?.status ?? 200, options.site?.body ?? siteFixture()),
  );
}
