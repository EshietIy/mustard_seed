import { expect, test } from '@playwright/test';
import { mockApi, SIGNED_IN_USER } from './support/mock-api';

test.describe('Feature: choosing options for a dish', () => {
  test('Scenario: a soup needs a protein before it can be added, and the choice follows the order', async ({
    page,
  }) => {
    await mockApi(page, { session: SIGNED_IN_USER });
    await page.goto('/');
    await page.getByRole('button', { name: 'Choose options for Fisherman Soup' }).click();

    const sheet = page.getByRole('dialog', { name: 'Fisherman Soup' });
    await expect(sheet.getByText('Required · choose 1')).toBeVisible();
    const add = sheet.getByRole('button', { name: /^Add to order/ });
    await expect(add).toBeDisabled();
    await expect(sheet.getByText('Choose a soup protein to add this.')).toBeVisible();
    await expect(sheet.getByLabel(/Turkey/)).toBeDisabled();

    await sheet.getByLabel(/Chicken/).check();
    await expect(add).toHaveText('Add to order · ₦6,500');
    await add.click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText('Added Fisherman Soup (Chicken) to your order')).toBeVisible();

    await page.getByRole('button', { name: /^Your order, 1 item$/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Your order' });
    await expect(drawer.getByText('Chicken')).toBeVisible();
    await expect(drawer.locator('[data-test="subtotal"]')).toHaveText('₦6,500');

    const quote = page.waitForRequest((r) => r.url().endsWith('/orders/quote'));
    await drawer.getByRole('button', { name: 'Checkout' }).click();
    await expect(page).toHaveURL('/checkout');
    expect((await quote).postDataJSON()).toMatchObject({
      items: [{ menuItemId: 'fisherman-soup', quantity: 1, optionIds: ['o-chicken'] }],
    });
    await expect(page.locator('[data-test="line-options"]')).toHaveText('Chicken');
  });

  test('Scenario: closing the choice sheet adds nothing', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Choose options for Fisherman Soup' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Fisherman Soup' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Your order, 0 items$/ })).toBeVisible();
  });
});
