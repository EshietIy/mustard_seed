import { expect, test, type Page } from '@playwright/test';

const CONFIG_URL = 'http://api.test/api/v1/config/public';

async function mockConfig(page: Page, status: number, body: unknown): Promise<void> {
  await page.route(CONFIG_URL, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test.describe('Feature: TEST MODE banner', () => {
  test('Scenario: payments are simulated, so the banner is shown', async ({ page }) => {
    await mockConfig(page, 200, { paymentMode: 'simulated' });
    await page.goto('/');
    await expect(page.getByRole('status')).toContainText('TEST MODE: payments are simulated');
  });

  test('Scenario: payments are live, so no banner is shown', async ({ page }) => {
    await mockConfig(page, 200, { paymentMode: 'live' });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Mustard Seed Restaurant & Bar' }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('Scenario: the config endpoint fails, and the site still renders', async ({ page }) => {
    await mockConfig(page, 500, { error: { code: 'INTERNAL_ERROR', message: 'x' } });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Mustard Seed Restaurant & Bar' }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('Scenario: the API is unreachable, and the site still renders', async ({ page }) => {
    await page.route(CONFIG_URL, (route) => route.abort('internetdisconnected'));
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Mustard Seed Restaurant & Bar' }),
    ).toBeVisible();
  });
});

test.describe('Feature: navigation', () => {
  test('Scenario: an unknown page shows a friendly not-found screen', async ({ page }) => {
    await mockConfig(page, 200, { paymentMode: 'live' });
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: "We couldn't find that page." })).toBeVisible();
    await page.getByRole('link', { name: 'Back to the menu' }).click();
    await expect(page).toHaveURL('/');
  });
});
