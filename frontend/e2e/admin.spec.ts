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
      'Item prices',
      'Photos',
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
