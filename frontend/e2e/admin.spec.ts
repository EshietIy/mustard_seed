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
