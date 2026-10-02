import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';

test.describe('Feature: landing page', () => {
  test('Scenario: every section from the design renders with live data and placeholders', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'The soul of Calabar, served warm.',
    );
    await expect(page.getByText('Open daily, 8am – 11pm')).toBeVisible();
    await expect(page.getByText('₦1,500 delivery anywhere in Calabar')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in with Google' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'From our pots to your table' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Fresh juices. Nothing added, nothing hidden.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /Two states\. One table\./ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Visit us' })).toBeVisible();
    await expect(page.getByText('[CALABAR ADDRESS]')).toBeVisible();
    await expect(page.getByText('[PHONE / WHATSAPP]')).toBeVisible();
    await expect(page.getByText('97 Tunde Ukpehe (Mitama), Uyo')).toBeVisible();
  });

  test('Scenario: menu cards show placeholders, real prices, badges and sold-out items', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/');
    const edikang = page.getByRole('article').filter({ hasText: 'Edikang Ikong' });
    await expect(edikang).toContainText('[PRICE]');
    await expect(edikang).toContainText('House signature');
    await expect(edikang).toContainText('Photo coming');
    await expect(page.getByRole('article').filter({ hasText: 'Afang Soup' })).toContainText(
      '₦4,500',
    );
    await expect(
      page.getByRole('article').filter({ hasText: 'Atama Soup' }).getByRole('button'),
    ).toBeDisabled();
  });

  test('Scenario: switching menu tabs, including an empty category', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Drinks' }).click();
    await expect(page.getByRole('tab', { name: 'Drinks' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { name: 'Zobo' })).toBeVisible();
    await page.getByRole('tab', { name: 'Continental' }).click();
    await expect(
      page.getByText('More dishes are coming to this part of the menu soon.'),
    ).toBeVisible();
  });

  test('Scenario: "See all drinks" jumps to the Drinks tab', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('link', { name: 'See all drinks' }).click();
    await expect(page.getByRole('tab', { name: 'Drinks' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('Scenario: building an order and seeing it survive a reload', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Afang Soup to your order' }).click();
    await page.getByRole('button', { name: 'Add Afang Soup to your order' }).click();
    await page.getByRole('button', { name: 'Add Edikang Ikong to your order' }).click();
    await expect(page.getByText('Added Edikang Ikong to your order')).toBeVisible();
    const orderButton = page.getByRole('button', { name: /^Your order, 3 items$/ });
    await expect(orderButton).toBeVisible();

    await page.reload();
    await orderButton.click();
    const drawer = page.getByRole('dialog', { name: 'Your order' });
    await expect(drawer).toContainText('Afang Soup');
    await expect(drawer).toContainText('₦9,000');
    await expect(drawer.locator('[data-test="subtotal"]')).toHaveText('[PRICE]');
    await expect(drawer).toContainText(
      'Delivery is ₦1,500 anywhere in Calabar, or pick up for free.',
    );
    await expect(drawer.getByRole('button', { name: 'Checkout' })).toBeEnabled();

    await drawer.getByRole('button', { name: 'Remove one Edikang Ikong' }).click();
    await expect(drawer.locator('[data-test="subtotal"]')).toHaveText('₦9,000');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });

  test('Scenario: the menu fails to load, and a retry recovers', async ({ page }) => {
    await mockApi(page, {
      menu: { status: 503, body: { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'ref-503' } } },
    });
    await page.goto('/');
    const alert = page.getByRole('alert').filter({ hasText: 'We couldn’t load the menu.' });
    await expect(alert).toContainText('Reference: ref-503');
    await page.unroute('http://api.test/api/v1/menu');
    await mockApi(page);
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Edikang Ikong' })).toBeVisible();
  });

  test('Scenario: the menu API is unreachable', async ({ page }) => {
    await mockApi(page, { menu: 'abort' });
    await page.goto('/');
    await expect(
      page.getByRole('alert').filter({ hasText: 'We couldn’t load the menu.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Scenario: the page never scrolls sideways', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Edikang Ikong' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBe(0);
  });
});
