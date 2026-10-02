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
          item('zobo', 'Zobo', { isFreshJuice: true, description: '' }),
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

export interface MockOptions {
  paymentMode?: 'simulated' | 'live';
  /** The session the API reports on load (default: signed out). */
  session?: typeof SIGNED_IN_USER | null;
  signIn?: { status: number; body: unknown };
  googleScript?: 'ok' | 'blocked';
  menu?: { status: number; body: unknown } | 'abort';
  site?: { status: number; body: unknown };
  config?: { status: number; body: unknown } | 'abort';
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
