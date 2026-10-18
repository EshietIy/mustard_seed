import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';

const HEADLINE = 'Calabar flavour, at your door.';
/** The banner, not other live regions on the page (e.g. the menu's search results). */
const banner = (page: Page) => page.getByRole('status').filter({ hasText: 'TEST MODE' });

test.describe('Feature: TEST MODE banner', () => {
  test('Scenario: payments are simulated, so the banner is shown', async ({ page }) => {
    await mockApi(page, { paymentMode: 'simulated' });
    await page.goto('/');
    await expect(banner(page)).toContainText('TEST MODE: payments are simulated');
  });

  test('Scenario: payments are live, so no banner is shown', async ({ page }) => {
    await mockApi(page, { paymentMode: 'live' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('Scenario: the config endpoint fails, and the site still renders', async ({ page }) => {
    await mockApi(page, { config: { status: 500, body: { error: { code: 'INTERNAL_ERROR' } } } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('Scenario: the config endpoint is unreachable, and the site still renders', async ({
    page,
  }) => {
    await mockApi(page, { config: 'abort' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  });
});

test.describe('Feature: navigation', () => {
  test('Scenario: an unknown page shows a friendly not-found screen', async ({ page }) => {
    await mockApi(page);
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: "We couldn't find that page." })).toBeVisible();
    await page.getByRole('link', { name: 'Back to the menu' }).click();
    await expect(page).toHaveURL('/');
  });
});
