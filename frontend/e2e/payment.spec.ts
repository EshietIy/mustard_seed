import { expect, test, type Page } from '@playwright/test';
import { mockApi, SIGNED_IN_USER, type MockOptions } from './support/mock-api';

async function placeOrder(page: Page, options: MockOptions = {}) {
  await mockApi(page, { session: SIGNED_IN_USER, ...options });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Afang Soup to your order' }).click();
  await page.goto('/checkout');
  await page.getByLabel('Phone number').fill('0803 123 4567');
  await page.getByLabel('Street address').fill('12 Marian Road');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page).toHaveURL('/orders/order-1');
}

test.describe('Feature: paying for an order', () => {
  test('Scenario: pay now, pay on the payment page, and see the order in the kitchen', async ({
    page,
  }) => {
    await placeOrder(page);
    await expect(page.getByText(/Pay by .+, or this order will expire\./)).toBeVisible();
    await expect(page.locator('[data-test="email-note"]')).toHaveText(
      `Once your payment is confirmed, we’ll email your order confirmation to ${SIGNED_IN_USER.email}.`,
    );
    await page.getByRole('button', { name: 'Pay ₦6,000 now' }).click();
    await expect(page).toHaveURL('https://pay.test/checkout/abc');
    await page.getByRole('link', { name: 'Pay successfully' }).click();
    await expect(page.getByText('Amedi, Ekaette! Your order is in the kitchen.')).toBeVisible();
    await expect(page.getByText('Paid — in the kitchen')).toBeVisible();
    await expect(page).toHaveURL('/orders/order-1');
    await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0);
  });

  test('Scenario: the payment did not go through', async ({ page }) => {
    await placeOrder(page, { paymentResult: 'payment_failed' });
    await page.goto('/orders/order-1?reference=MS0001-test&trxref=MS0001-test');
    await expect(page.getByRole('alert')).toContainText(
      'Your payment didn’t go through. You have not been charged.',
    );
    await page.getByRole('button', { name: 'Order again' }).click();
    await expect(page).toHaveURL('/checkout');
    await expect(page.locator('[data-test="total"]')).toHaveText('₦6,000');
  });

  test('Scenario: a pending payment is confirmed after a short wait', async ({ page }) => {
    await placeOrder(page, { paymentResult: 'pending-then-paid' });
    await page.goto('/orders/order-1?reference=MS0001-test');
    await expect(page.getByText('Confirming your payment…')).toBeVisible();
    await expect(page.getByText('Your order is in the kitchen.')).toBeVisible({ timeout: 10_000 });
  });

  test('Scenario: confirmation fails, the page never guesses, and a retry succeeds', async ({
    page,
  }) => {
    await placeOrder(page, { paymentResult: 'verify-down' });
    await page.goto('/orders/order-1?reference=MS0001-test');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('We couldn’t confirm your payment yet.');
    await expect(alert).toContainText('Reference: ref-verify');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Your order is in the kitchen.')).toBeVisible();
  });

  test('Scenario: the payment service is unavailable when paying', async ({ page }) => {
    await placeOrder(page, {
      startPayment: {
        status: 503,
        body: { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'ref-pay' } },
      },
    });
    await page.getByRole('button', { name: 'Pay ₦6,000 now' }).click();
    await expect(page.getByRole('alert')).toContainText('We couldn’t open the payment page.');
    await expect(page.getByRole('button', { name: 'Pay ₦6,000 now' })).toBeEnabled();
  });
});
