import { expect, test } from '@playwright/test';
import { API, mockApi, SIGNED_IN_USER } from './support/mock-api';

const SUPERVISOR = { ...SIGNED_IN_USER, id: 'u-sup', firstName: 'Ime', role: 'supervisor' };
const SUPER_ADMIN = { ...SIGNED_IN_USER, id: 'u-admin', firstName: 'Nse', role: 'super_admin' };

test.describe('Feature: the staff area', () => {
  test('Scenario: a supervisor opens the staff area from the account menu', async ({ page }) => {
    await mockApi(page, { session: SUPERVISOR });
    await page.goto('/');
    await page.getByRole('button', { name: 'Account: Ime' }).click();
    await page.getByRole('menuitem', { name: 'Staff area' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Welcome, Ime' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Staff screens' });
    await expect(nav.getByRole('link')).toHaveText(['Overview', 'Availability', 'Meats & prices']);
    await expect(page.getByText('Kitchen supervisor')).toBeVisible();
  });

  test('Scenario: a super admin sees every screen', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.goto('/admin');
    const nav = page.getByRole('navigation', { name: 'Staff screens' });
    await expect(nav.getByRole('link')).toHaveText([
      'Overview',
      'Availability',
      'Meats & prices',
      'Dishes',
      'Item prices',
      'Photos',
      'Reports',
      'Staff',
    ]);
  });

  test('Scenario: a supervisor types the address of a super admin screen', async ({ page }) => {
    await mockApi(page, { session: SUPERVISOR });
    await page.goto('/admin/photos');
    await expect(page.getByRole('alert')).toContainText('Your role can’t use this screen');
    await page.getByRole('link', { name: 'Back to the overview' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('Scenario: a customer is kept out', async ({ page }) => {
    await mockApi(page, { session: SIGNED_IN_USER });
    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'This area is for Mustard Seed staff' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Staff screens' })).toHaveCount(0);
  });

  test('Scenario: a signed-out visitor is asked to sign in', async ({ page }) => {
    await mockApi(page, {
      signIn: { status: 200, body: { user: SUPERVISOR } },
    });
    await page.goto('/admin/availability');
    await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Continue with Google (test)' })
      .click();
    await expect(page.getByRole('heading', { name: 'Availability' })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/availability$/);
  });

  test('Scenario: signing out of the staff area', async ({ page }) => {
    await mockApi(page, { session: SUPERVISOR });
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('You’ve signed out.')).toBeVisible();
  });
});

const PROTEIN_GROUP = {
  id: 'g-protein',
  name: 'Soup protein',
  minChoices: 1,
  maxChoices: 1,
  sortOrder: 0,
  archived: false,
  itemIds: ['fisherman-soup'],
  options: [
    {
      id: 'o-turkey',
      name: 'Turkey',
      priceDeltaKobo: 0,
      isAvailable: false,
      sortOrder: 0,
      archived: false,
      excludedFromItemIds: [],
      priceOverrides: [],
    },
  ],
};

test.describe('Feature: switching dishes and meats on and off', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { session: SUPERVISOR });
    await page.route(`${API}/admin/option-groups`, (route) =>
      route.fulfill({ json: [PROTEIN_GROUP] }),
    );
  });

  test('Scenario: a supervisor marks a dish sold out', async ({ page }) => {
    await page.route(`${API}/admin/menu-items/afang-soup`, (route) =>
      route.fulfill({
        json: {
          id: 'afang-soup',
          name: 'Afang Soup',
          category: 'calabar_soups',
          priceKobo: 450000,
          isAvailable: false,
        },
      }),
    );
    await page.goto('/admin');
    await page
      .getByRole('navigation', { name: 'Staff screens' })
      .getByRole('link', { name: 'Availability' })
      .click();
    const afang = page.getByRole('switch', { name: 'Afang Soup available' });
    await expect(afang).toHaveAttribute('aria-checked', 'true');
    const saved = page.waitForRequest(`${API}/admin/menu-items/afang-soup`);
    await afang.click();
    expect((await saved).postDataJSON()).toEqual({ isAvailable: false });
    await expect(afang).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Afang Soup is now sold out.')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Atama Soup available' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('Scenario: switching a meat back on fails and the switch stays off', async ({ page }) => {
    await page.route(`${API}/admin/options/o-turkey`, (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'The service is busy. Please try again.',
            requestId: 'ref-503',
          },
        },
      }),
    );
    await page.goto('/admin/availability');
    const turkey = page.getByRole('switch', { name: 'Turkey available' });
    await turkey.click();
    await expect(page.getByRole('alert')).toContainText('Reference: ref-503');
    await expect(turkey).toHaveAttribute('aria-checked', 'false');
  });

  test('Scenario: the menu cannot load, and a retry recovers', async ({ page }) => {
    let calls = 0;
    await page.route(`${API}/admin/option-groups`, (route) =>
      ++calls === 1
        ? route.fulfill({
            status: 503,
            json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Busy.', requestId: 'ref-1' } },
          })
        : route.fulfill({ json: [PROTEIN_GROUP] }),
    );
    await page.goto('/admin/availability');
    await expect(page.getByRole('alert')).toContainText('We couldn’t load the menu.');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('switch', { name: 'Turkey available' })).toBeVisible();
  });
});

const meatOption = (id: string, name: string, priceDeltaKobo: number) => ({
  id,
  name,
  priceDeltaKobo,
  isAvailable: true,
  sortOrder: 10,
  archived: false,
  excludedFromItemIds: [],
  priceOverrides: [],
});

const soupProtein = (extra: ReturnType<typeof meatOption>[] = []) => ({
  ...PROTEIN_GROUP,
  itemIds: ['afang-soup', 'fisherman-soup'],
  options: [meatOption('o-chicken', 'Chicken', 50000), ...extra],
});

test.describe('Feature: meats and their prices', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { session: SUPERVISOR });
    await page.route(`${API}/admin/option-groups`, (route) =>
      route.fulfill({ json: [soupProtein()] }),
    );
  });

  test('Scenario: a supervisor adds goat meat on one soup only', async ({ page }) => {
    await page.route(`${API}/admin/option-groups/g-protein/options`, (route) =>
      route.fulfill({
        status: 201,
        json: soupProtein([meatOption('o-goat', 'Goat meat', 90000)]),
      }),
    );
    await page.goto('/admin/meats');
    const form = page.locator('[data-test="add-meat"]');
    await form.getByLabel('Name').fill('Goat meat');
    await form.getByLabel('Extra cost (₦)').fill('900');
    await form.getByLabel('Fisherman Soup').uncheck();
    const sent = page.waitForRequest(`${API}/admin/option-groups/g-protein/options`);
    await form.getByRole('button', { name: 'Add' }).click();
    expect((await sent).postDataJSON()).toEqual({
      name: 'Goat meat',
      priceDeltaKobo: 90000,
      itemIds: ['afang-soup'],
    });
    await expect(page.getByRole('heading', { name: 'Goat meat' })).toBeVisible();
    await expect(page.getByText('Goat meat added.')).toBeVisible();
  });

  test('Scenario: a supervisor charges more for chicken on Fisherman Soup', async ({ page }) => {
    await page.route(`${API}/admin/menu-items/fisherman-soup/options/o-chicken`, (route) =>
      route.fulfill({
        json: {
          itemId: 'fisherman-soup',
          optionId: 'o-chicken',
          isExcluded: false,
          priceDeltaKobo: 80000,
        },
      }),
    );
    await page.goto('/admin/meats');
    await page.getByRole('button', { name: 'Set a different price on a dish' }).click();
    await page.getByLabel('Chicken extra cost on Fisherman Soup').fill('800');
    const sent = page.waitForRequest(`${API}/admin/menu-items/fisherman-soup/options/o-chicken`);
    await page
      .locator('[data-test="dish-price"]', { hasText: 'Fisherman Soup' })
      .getByRole('button', { name: 'Save' })
      .click();
    expect((await sent).postDataJSON()).toEqual({ priceDeltaKobo: 80000 });
    await expect(page.getByText('Chicken now adds ₦800 on Fisherman Soup.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Different price on 1 dish' })).toBeVisible();
  });

  test('Scenario: adding a meat whose name is already used', async ({ page }) => {
    await page.route(`${API}/admin/option-groups/g-protein/options`, (route) =>
      route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'OPTION_NAME_TAKEN',
            message: 'That name is already in use here. Choose a different name.',
          },
        },
      }),
    );
    await page.goto('/admin/meats');
    const form = page.locator('[data-test="add-meat"]');
    await form.getByLabel('Name').fill('Chicken');
    await form.getByLabel('Extra cost (₦)').fill('0');
    await form.getByRole('button', { name: 'Add' }).click();
    await expect(form.getByRole('alert')).toHaveText(
      'That name is already in use here. Choose a different name.',
    );
  });
});

test.describe('Feature: super admin tools for meats', () => {
  test('Scenario: a super admin archives a meat, then restores it', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    const goat = meatOption('o-goat', 'Goat meat', 90000);
    let archived = false;
    await page.route(`${API}/admin/option-groups`, (route) =>
      route.fulfill({ json: [soupProtein([{ ...goat, archived }])] }),
    );
    await page.route(`${API}/admin/options/o-goat`, (route) => {
      archived = (route.request().postDataJSON() as { archived: boolean }).archived;
      return route.fulfill({ json: soupProtein([{ ...goat, archived }]) });
    });
    await page.goto('/admin/meats');
    const card = page.locator('[data-test="meat"]', { hasText: 'Goat meat' });
    await card.getByRole('button', { name: 'Archive' }).click();
    await expect(card.getByText('Past orders still show it.')).toBeVisible();
    await card.locator('[data-test="archive-yes"]').click();
    await expect(page.getByText('Goat meat archived.')).toBeVisible();
    await expect(page.locator('[data-test="meat"]', { hasText: 'Goat meat' })).toHaveCount(0);
    const archivedList = page.locator('[data-test="archived"]');
    await archivedList.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Goat meat is back on the menu.')).toBeVisible();
    await expect(page.locator('[data-test="meat"]', { hasText: 'Goat meat' })).toBeVisible();
  });

  test('Scenario: a supervisor gets no rename, move or archive buttons', async ({ page }) => {
    await mockApi(page, { session: SUPERVISOR });
    await page.route(`${API}/admin/option-groups`, (route) =>
      route.fulfill({ json: [soupProtein()] }),
    );
    await page.goto('/admin/meats');
    await expect(page.getByRole('heading', { name: 'Chicken' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Move Chicken up' })).toHaveCount(0);
  });
});

test.describe('Feature: managing dishes', () => {
  const dish = (overrides: object) => ({
    id: 'd-x',
    slug: 'x',
    name: 'X',
    description: '',
    category: 'calabar_soups',
    priceKobo: 400000,
    isAvailable: true,
    isHouseSignature: false,
    sortOrder: 10,
    archivedAt: null,
    ...overrides,
  });
  const AFANG = dish({ id: 'd-afang', name: 'Afang Soup' });
  const EDIKANG = dish({ id: 'd-edikang', name: 'Edikang Ikong', sortOrder: 20 });
  const conflict = (message: string) => ({
    status: 409,
    json: { error: { code: 'DISH_NAME_TAKEN', message, requestId: 'req-2' } },
  });
  const soups = (page: import('@playwright/test').Page) =>
    page.locator('[data-category="calabar_soups"] [data-test="dish"] .name');

  test('Scenario: a super admin adds a new dish, switched off', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/menu-items`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 201,
            json: dish({
              id: 'd-atama',
              name: 'Atama Soup',
              priceKobo: 420000,
              isAvailable: false,
              sortOrder: 30,
            }),
          })
        : route.fulfill({ json: [AFANG, EDIKANG] }),
    );
    await page.goto('/admin/dishes');
    await page.getByLabel('Name').fill('Atama Soup');
    await page.getByLabel('Category').selectOption('calabar_soups');
    await page.getByLabel('Price in naira (optional)').fill('4,200');
    const sent = page.waitForRequest(
      (r) => r.url() === `${API}/admin/menu-items` && r.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Add dish' }).click();
    expect((await sent).postDataJSON()).toEqual({
      name: 'Atama Soup',
      category: 'calabar_soups',
      description: '',
      isHouseSignature: false,
      priceKobo: 420000,
    });
    await expect(
      page.getByText(
        'Atama Soup added, switched off. Add a photo, then switch it on in Availability.',
      ),
    ).toBeVisible();
    await expect(soups(page)).toHaveText(['Afang Soup', 'Edikang Ikong', 'Atama Soup']);
    await expect(page.locator('[data-test="dish"]', { hasText: 'Atama Soup' })).toContainText(
      'Switched off',
    );
  });

  test('Scenario: a name already on the menu is explained', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/menu-items`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(conflict('A dish called “Afang Soup” is already on the menu.'))
        : route.fulfill({ json: [AFANG, EDIKANG] }),
    );
    await page.goto('/admin/dishes');
    await page.getByLabel('Name').fill('afang soup');
    await page.getByRole('button', { name: 'Add dish' }).click();
    await expect(
      page.getByText('A dish called “Afang Soup” is already on the menu.'),
    ).toBeVisible();
    await expect(soups(page)).toHaveText(['Afang Soup', 'Edikang Ikong']);
  });

  test('Scenario: a super admin moves a dish up', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/menu-items`, (route) =>
      route.fulfill({ json: [AFANG, EDIKANG] }),
    );
    await page.route(`${API}/admin/menu-items/d-edikang/move`, (route) =>
      route.fulfill({
        json: [
          { ...EDIKANG, sortOrder: 10 },
          { ...AFANG, sortOrder: 20 },
        ],
      }),
    );
    await page.goto('/admin/dishes');
    await expect(page.getByRole('button', { name: 'Move Afang Soup up' })).toBeDisabled();
    const sent = page.waitForRequest(`${API}/admin/menu-items/d-edikang/move`);
    await page.getByRole('button', { name: 'Move Edikang Ikong up' }).click();
    expect((await sent).postDataJSON()).toEqual({ direction: 'up' });
    await expect(soups(page)).toHaveText(['Edikang Ikong', 'Afang Soup']);
  });

  test('Scenario: a super admin edits a dish', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/menu-items`, (route) =>
      route.fulfill({ json: [AFANG, EDIKANG] }),
    );
    await page.route(`${API}/admin/menu-items/d-afang`, (route) =>
      route.fulfill({
        json: { ...AFANG, description: 'Afang and waterleaf', isHouseSignature: true },
      }),
    );
    await page.goto('/admin/dishes');
    const row = page.locator('[data-test="dish"]', { hasText: 'Afang Soup' });
    await row.getByRole('button', { name: 'Edit' }).click();
    await row.getByLabel('Description').fill('Afang and waterleaf');
    await row.getByLabel('House signature').check();
    const sent = page.waitForRequest(`${API}/admin/menu-items/d-afang`);
    await row.getByRole('button', { name: 'Save' }).click();
    expect((await sent).postDataJSON()).toEqual({
      description: 'Afang and waterleaf',
      isHouseSignature: true,
    });
    await expect(page.getByText('Afang Soup saved.')).toBeVisible();
    await expect(row).toContainText('House signature');
    await expect(row).toContainText('Afang and waterleaf');
  });

  test('Scenario: a super admin retires a dish and brings it back', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/menu-items`, (route) =>
      route.fulfill({ json: [AFANG, EDIKANG] }),
    );
    await page.route(`${API}/admin/menu-items/d-edikang`, (route) => {
      const { isArchived } = route.request().postDataJSON() as { isArchived: boolean };
      return route.fulfill({
        json: isArchived
          ? { ...EDIKANG, archivedAt: '2026-10-25T10:00:00Z' }
          : { ...EDIKANG, isAvailable: false },
      });
    });
    await page.goto('/admin/dishes');
    const row = page.locator('[data-test="dish"]', { hasText: 'Edikang Ikong' });
    await row.getByRole('button', { name: 'Retire' }).click();
    await expect(row).toContainText('Past orders still show it');
    await row.locator('[data-test="retire-yes"]').click();
    await expect(page.getByText('Edikang Ikong retired.')).toBeVisible();
    await expect(soups(page)).toHaveText(['Afang Soup']);
    const retired = page.locator('[data-test="retired"]', { hasText: 'Edikang Ikong' });
    await expect(retired).toContainText('Retired 25 Oct 2026');

    await retired.getByRole('button', { name: 'Bring back' }).click();
    await expect(
      page.getByText(
        'Edikang Ikong is back on the menu, switched off. Switch it on in Availability when it’s ready.',
      ),
    ).toBeVisible();
    await expect(soups(page)).toHaveText(['Afang Soup', 'Edikang Ikong']);
    await expect(page.locator('[data-test="retired"]')).toHaveCount(0);
  });

  test('Scenario: a supervisor cannot open the dishes screen', async ({ page }) => {
    await mockApi(page, { session: SUPERVISOR });
    await page.goto('/admin/dishes');
    await expect(page.getByRole('alert')).toContainText('Your role can’t use this screen');
    await expect(page.locator('[data-test="dish"]')).toHaveCount(0);
  });
});

test.describe('Feature: sales reports', () => {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: hour === 13 ? 2 : 0,
    salesKobo: hour === 13 ? 1610000 : 0,
  }));
  const weekdays = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ].map((weekday) => ({
    weekday,
    orders: weekday === 'tuesday' ? 2 : 0,
    salesKobo: weekday === 'tuesday' ? 1610000 : 0,
  }));
  const REPORT = {
    from: '2026-10-01',
    to: '2026-10-07',
    timezone: 'Africa/Lagos',
    summary: {
      orders: 2,
      salesKobo: 1610000,
      foodSalesKobo: 1460000,
      deliveryFeesKobo: 150000,
      averageOrderKobo: 805000,
      itemsSold: 4,
      deliveryOrders: 1,
      pickupOrders: 1,
      unpaid: { paymentFailed: 1, expired: 0 },
    },
    dishes: [
      {
        menuItemId: 'zobo',
        name: 'Zobo',
        category: 'fresh_juices',
        retired: false,
        quantity: 3,
        salesKobo: 240000,
        orders: 2,
      },
      {
        menuItemId: 'afang-soup',
        name: 'Afang Soup',
        category: 'calabar_soups',
        retired: false,
        quantity: 1,
        salesKobo: 1220000,
        orders: 1,
      },
    ],
    unsoldDishes: [{ menuItemId: 'garri', name: 'Garri', category: 'swallow' }],
    options: [{ groupName: 'Soup protein', name: 'Beef', quantity: 1, extraSalesKobo: 0 }],
    days: [{ date: '2026-10-06', orders: 2, salesKobo: 1610000 }],
    hours,
    weekdays,
  };

  test('Scenario: a super admin sees the best sellers and switches period', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    const asked: string[] = [];
    await page.route(`${API}/admin/reports/sales?**`, (route) => {
      asked.push(new URL(route.request().url()).search);
      return route.fulfill({ json: REPORT });
    });
    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.locator('[data-test="best-seller"]').first()).toContainText('Zobo');
    await expect(page.locator('[data-test="tile"]').first()).toContainText('₦16,100');
    await expect(page.getByText('Busiest: Tuesdays, and 1pm to 2pm.')).toBeVisible();
    await expect(page.locator('[data-test="unsold"]')).toContainText('Garri');

    await page.getByRole('button', { name: 'Highest sales' }).click();
    await expect(page.locator('[data-test="best-seller"]').first()).toContainText('Afang Soup');

    await page.getByRole('button', { name: 'Last 7 days' }).click();
    await expect(page.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(asked).toHaveLength(2);
    expect(asked.every((q) => /^\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/.test(q))).toBe(
      true,
    );
  });

  test('Scenario: a super admin downloads the best sellers', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/reports/sales?**`, (route) => route.fulfill({ json: REPORT }));
    await page.goto('/admin/reports');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download best sellers as CSV' }).click();
    expect((await download).suggestedFilename()).toBe('best-sellers-2026-10-01-to-2026-10-07.csv');
    const daily = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download sales by day as CSV' }).click();
    expect((await daily).suggestedFilename()).toBe('sales-by-day-2026-10-01-to-2026-10-07.csv');
  });

  test('Scenario: a super admin prints the report without the controls', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/reports/sales?**`, (route) => route.fulfill({ json: REPORT }));
    await page.goto('/admin/reports');
    await page.evaluate(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
      };
    });
    await page.getByRole('button', { name: 'Print / Save as PDF' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('navigation', { name: 'Staff screens' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Last 7 days' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Download best sellers as CSV' })).toBeHidden();
    await expect(page.getByText('Sales report · 1 Oct 2026 – 7 Oct 2026')).toBeVisible();
    await expect(page.locator('[data-test="best-seller"]').first()).toBeVisible();
  });

  test('Scenario: a super admin looks at yesterday', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    const asked: string[] = [];
    await page.route(`${API}/admin/reports/sales?**`, (route) => {
      asked.push(new URL(route.request().url()).search);
      return route.fulfill({ json: REPORT });
    });
    await page.goto('/admin/reports');
    await expect(page.locator('[data-test="best-seller"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Yesterday' }).click();
    await expect(page.getByRole('button', { name: 'Yesterday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const [, from, to] = /from=([\d-]+)&to=([\d-]+)/.exec(asked.at(-1) ?? '') ?? [];
    expect(from).toBe(to);
  });

  test('Scenario: a failed report can be tried again', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    let calls = 0;
    await page.route(`${API}/admin/reports/sales?**`, (route) =>
      ++calls === 1
        ? route.fulfill({
            status: 503,
            json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'down', requestId: 'req-3' } },
          })
        : route.fulfill({ json: REPORT }),
    );
    await page.goto('/admin/reports');
    await expect(page.getByText('We couldn’t load the report.')).toBeVisible();
    await page.getByRole('button', { name: /try again/i }).click();
    await expect(page.locator('[data-test="best-seller"]')).toHaveCount(2);
  });

  test('Scenario: a supervisor cannot open reports', async ({ page }) => {
    await mockApi(page, { session: SUPERVISOR });
    await page.goto('/admin/reports');
    await expect(page.getByRole('alert')).toContainText('Your role can’t use this screen');
  });
});

test.describe('Feature: dish prices', () => {
  test('Scenario: a super admin prices a dish that showed [PRICE]', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/menu-items/edikang-ikong`, (route) =>
      route.fulfill({
        json: {
          id: 'edikang-ikong',
          name: 'Edikang Ikong',
          category: 'calabar_soups',
          priceKobo: 550000,
          isAvailable: true,
        },
      }),
    );
    await page.goto('/admin/prices');
    const row = page.locator('[data-test="dish"]', { hasText: 'Edikang Ikong' });
    await expect(row).toContainText('[PRICE]');
    await row.getByLabel('Price of Edikang Ikong in naira').fill('5,500');
    const sent = page.waitForRequest(`${API}/admin/menu-items/edikang-ikong`);
    await row.getByRole('button', { name: 'Save' }).click();
    expect((await sent).postDataJSON()).toEqual({ priceKobo: 550000 });
    await expect(page.getByText('Edikang Ikong now costs ₦5,500.')).toBeVisible();
    await expect(row).not.toContainText('[PRICE]');
  });

  test('Scenario: a supervisor cannot open the prices screen', async ({ page }) => {
    await mockApi(page, { session: SUPERVISOR });
    await page.goto('/admin/prices');
    await expect(page.getByRole('alert')).toContainText('Your role can’t use this screen');
    await expect(page.locator('[data-test="dish"]')).toHaveCount(0);
  });
});

test.describe('Feature: dish photos', () => {
  const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const usage = (percent: number) => ({
    usedBytes: 13_000_000,
    allowanceBytes: 1_073_741_824,
    percent,
    nearLimit: percent >= 70,
  });

  test('Scenario: a super admin uploads a photo for a dish', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/storage-usage`, (route) => route.fulfill({ json: usage(1.2) }));
    await page.route('https://img.test/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: PNG_1PX }),
    );
    await page.route(`${API}/admin/menu-items/edikang-ikong/image`, (route) =>
      route.fulfill({
        status: 201,
        json: {
          itemId: 'edikang-ikong',
          image: {
            thumbnailUrl: 'https://img.test/edikang/thumb.webp',
            fullUrl: 'https://img.test/edikang/full.webp',
          },
          sizes: { originalBytes: 70, thumbBytes: 40, fullBytes: 50 },
          oldFilesRemoved: true,
          storage: usage(1.3),
        },
      }),
    );
    await page.goto('/admin/photos');
    await expect(page.getByText('Photo storage: 12.4 MB of 1 GB used (1.2%)')).toBeVisible();
    const row = page.locator('[data-test="dish"]', { hasText: 'Edikang Ikong' });
    await expect(row).toContainText('Photo coming');
    const sent = page.waitForRequest(`${API}/admin/menu-items/edikang-ikong/image`);
    await row.getByLabel('Upload a photo of Edikang Ikong').setInputFiles({
      name: 'edikang.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    });
    expect((await sent).headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    await expect(page.getByText('Photo of Edikang Ikong saved.')).toBeVisible();
    await expect(row.getByRole('img', { name: 'Edikang Ikong' })).toHaveAttribute(
      'src',
      'https://img.test/edikang/thumb.webp',
    );
    await expect(page.getByText('(1.3%)')).toBeVisible();
  });

  test('Scenario: a refused photo is explained and nothing changes', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/storage-usage`, (route) => route.fulfill({ json: usage(1.2) }));
    await page.route(`${API}/admin/menu-items/edikang-ikong/image`, (route) =>
      route.fulfill({
        status: 415,
        json: {
          error: {
            code: 'IMAGE_TYPE_MISMATCH',
            message:
              'That file’s contents don’t match its type. Save it again as JPEG, PNG or WebP.',
            requestId: 'req-77',
          },
        },
      }),
    );
    await page.goto('/admin/photos');
    const row = page.locator('[data-test="dish"]', { hasText: 'Edikang Ikong' });
    await row.getByLabel('Upload a photo of Edikang Ikong').setInputFiles({
      name: 'edikang.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    });
    await expect(row.getByRole('alert')).toContainText('don’t match its type');
    await expect(row.getByRole('alert')).toContainText('Reference: req-77');
    await expect(row).toContainText('Photo coming');
  });

  test('Scenario: storage past 70% warns the super admin', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/storage-usage`, (route) => route.fulfill({ json: usage(72.5) }));
    await page.goto('/admin/photos');
    await expect(page.getByRole('alert')).toContainText('Photo storage is 72.5% full');
  });
});

test.describe('Feature: staff management', () => {
  const OWNER_ROW = {
    id: 's-owner',
    email: SUPER_ADMIN.email,
    role: 'super_admin',
    isActive: true,
    createdAt: '2026-10-01T09:00:00Z',
    deactivatedAt: null,
  };
  const CHEF_ROW = {
    ...OWNER_ROW,
    id: 's-chef',
    email: 'chef@example.com',
    role: 'supervisor',
    createdAt: '2026-10-20T09:00:00Z',
  };

  test('Scenario: a super admin adds a kitchen supervisor', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/staff`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 201,
            json: { ...CHEF_ROW, id: 's-ime', email: 'ime@example.com' },
          })
        : route.fulfill({ json: [OWNER_ROW] }),
    );
    await page.goto('/admin/staff');
    await expect(page.locator('[data-test="staff"]', { hasText: SUPER_ADMIN.email })).toContainText(
      'You',
    );
    await page.getByLabel('Google email').fill('ime@example.com');
    await page.getByLabel('Role').selectOption('supervisor');
    const sent = page.waitForRequest(
      (r) => r.url() === `${API}/admin/staff` && r.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    expect((await sent).postDataJSON()).toEqual({ email: 'ime@example.com', role: 'supervisor' });
    await expect(
      page.getByText(
        'ime@example.com added as Kitchen supervisor. They sign in with that Google account.',
      ),
    ).toBeVisible();
    await expect(page.locator('[data-test="staff"]', { hasText: 'ime@example.com' })).toContainText(
      'Kitchen supervisor',
    );
  });

  test('Scenario: a super admin removes a supervisor’s access', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/staff`, (route) =>
      route.fulfill({ json: [OWNER_ROW, CHEF_ROW] }),
    );
    await page.route(`${API}/admin/staff/s-chef`, (route) =>
      route.fulfill({
        json: { ...CHEF_ROW, isActive: false, deactivatedAt: '2026-10-25T10:00:00Z' },
      }),
    );
    await page.goto('/admin/staff');
    const row = page.locator('[data-test="staff"]', { hasText: 'chef@example.com' });
    await row.getByRole('button', { name: 'Remove access' }).click();
    const sent = page.waitForRequest(`${API}/admin/staff/s-chef`);
    await row.locator('[data-test="confirm-yes"]').click();
    expect((await sent).postDataJSON()).toEqual({ isActive: false });
    await expect(row).toContainText('No staff access since 25 Oct 2026');
    await expect(row.getByRole('button', { name: 'Give access again' })).toBeVisible();
  });

  test('Scenario: an email already on the list is explained', async ({ page }) => {
    await mockApi(page, { session: SUPER_ADMIN });
    await page.route(`${API}/admin/staff`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 409,
            json: {
              error: {
                code: 'STAFF_EXISTS',
                message: 'That email is already on the staff list.',
                requestId: 'req-1',
              },
            },
          })
        : route.fulfill({ json: [OWNER_ROW, CHEF_ROW] }),
    );
    await page.goto('/admin/staff');
    await page.getByLabel('Google email').fill('chef@example.com');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('That email is already on the staff list.')).toBeVisible();
    await expect(page.locator('[data-test="staff"]')).toHaveCount(2);
  });

  test('Scenario: a supervisor cannot open the staff screen', async ({ page }) => {
    await mockApi(page, { session: SUPERVISOR });
    await page.goto('/admin/staff');
    await expect(page.getByRole('alert')).toContainText('Your role can’t use this screen');
    await expect(page.locator('[data-test="add-staff"]')).toHaveCount(0);
  });
});
