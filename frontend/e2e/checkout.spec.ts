import { expect, test, type Page } from '@playwright/test';
import { API, mockApi, SIGNED_IN_USER, type MockOptions } from './support/mock-api';

async function addToOrderAndCheckout(page: Page, options: MockOptions = {}) {
  await mockApi(page, { session: SIGNED_IN_USER, ...options });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Afang Soup to your order' }).click();
  await page.getByRole('button', { name: 'Add Afang Soup to your order' }).click();
  await page.getByRole('tab', { name: 'Fresh juices' }).click();
  await page.getByRole('button', { name: 'Add Zobo to your order' }).click();
  await page.getByRole('button', { name: /^Your order, 3 items$/ }).click();
  await page
    .getByRole('dialog', { name: 'Your order' })
    .getByRole('button', { name: 'Checkout' })
    .click();
  await expect(page).toHaveURL('/checkout');
}

test.describe('Feature: checkout', () => {
  test('Scenario: a signed-in customer places a delivery order', async ({ page }) => {
    await addToOrderAndCheckout(page);
    await expect(page.getByLabel('Name for the order')).toHaveValue('Ekaette Bassey');
    await expect(page.locator('[data-test="total"]')).toHaveText('₦11,300');
    await page.getByLabel('Phone number').fill('0803 123 4567');
    await page.getByLabel('Street address').fill('12 Marian Road, near the roundabout');
    const request = page.waitForRequest(
      (r) => r.url().endsWith('/api/v1/orders') && r.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Place order' }).click();
    const sent = (await request).postDataJSON() as Record<string, unknown>;
    expect(sent).toMatchObject({
      fulfilment: 'delivery',
      expectedTotalKobo: 1130000,
      delivery: { city: 'Calabar' },
    });
    await expect(page).toHaveURL('/orders/order-1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Order #MS-0001');
    await expect(page.getByText('Awaiting payment')).toBeVisible();
    await expect(page.getByText('12 Marian Road, near the roundabout')).toBeVisible();
    await page.getByRole('link', { name: 'Back to the menu', exact: true }).click();
    // The cart is kept until payment is verified (AGENT.md section 13).
    await expect(page.getByRole('button', { name: /^Your order, 3 items$/ })).toBeVisible();
  });

  test('Scenario: + and − respond at once on a slow connection', async ({ page }) => {
    await mockApi(page, { session: SIGNED_IN_USER, serverCart: true });
    const loaded = page.waitForResponse((r) => r.url() === `${API}/cart`);
    await page.goto('/');
    await loaded;
    await page.getByRole('button', { name: 'Add Afang Soup to your order' }).click();
    await page.getByRole('button', { name: /^Your order, 1 item$/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Your order' });

    // Saves hang until the clicks are done, like a very slow connection.
    const sent: number[] = [];
    let release!: () => void;
    const connection = new Promise<void>((resolve) => (release = resolve));
    await page.route(`${API}/cart/lines`, async (route) => {
      sent.push((route.request().postDataJSON() as { quantity: number }).quantity);
      await connection;
      await route.fallback();
    });
    const more = drawer.getByRole('button', { name: /^Add one more Afang Soup/ });
    await more.click();
    await more.click();
    await more.click();
    await expect(drawer.locator('.qty')).toHaveText('4', { timeout: 500 });
    await drawer.getByRole('button', { name: /^Remove one Afang Soup/ }).click();
    await expect(drawer.locator('.qty')).toHaveText('3', { timeout: 500 });
    release();

    // Once saved, the server holds the last quantity and the screen still shows it.
    await expect.poll(() => sent.at(-1), { timeout: 10_000 }).toBe(3);
    expect(sent).toEqual([2, 3]);
    await expect(drawer.locator('.qty')).toHaveText('3');
  });

  test('Scenario: switching to pickup removes the delivery fee and the address field', async ({
    page,
  }) => {
    await addToOrderAndCheckout(page);
    await page.getByLabel('Pickup').check();
    await expect(page.locator('[data-test="total"]')).toHaveText('₦9,800');
    await expect(page.getByLabel('Street address')).toHaveCount(0);
    await expect(page.getByText('[CALABAR ADDRESS]')).toBeVisible();
  });

  test('Scenario: required details are checked before sending', async ({ page }) => {
    await addToOrderAndCheckout(page);
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByText('Enter a phone number so the rider can reach you')).toBeVisible();
    await expect(page.getByLabel('Phone number')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL('/checkout');
  });

  test('Scenario: online ordering is closed', async ({ page }) => {
    await addToOrderAndCheckout(page, { orderingOpen: false });
    await expect(
      page.getByRole('alert').filter({ hasText: 'Online orders are open 8am – 10:30pm' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Place order' })).toBeDisabled();
  });

  test('Scenario: the server rejects the phone number', async ({ page }) => {
    await addToOrderAndCheckout(page, {
      placeOrder: {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Some fields are invalid.',
            details: [
              {
                field: 'contact.phone',
                messages: ['Enter a valid Nigerian phone number, e.g. 0803 123 4567'],
              },
            ],
          },
        },
      },
    });
    await page.getByLabel('Phone number').fill('12345');
    await page.getByLabel('Street address').fill('12 Marian Road');
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(
      page.getByText('Enter a valid Nigerian phone number, e.g. 0803 123 4567'),
    ).toBeVisible();
  });

  test('Scenario: placing the order fails upstream and can be retried', async ({ page }) => {
    await addToOrderAndCheckout(page, {
      placeOrder: {
        status: 503,
        body: { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'ref-503' } },
      },
    });
    await page.getByLabel('Phone number').fill('0803 123 4567');
    await page.getByLabel('Street address').fill('12 Marian Road');
    await page.getByRole('button', { name: 'Place order' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Your order was not placed.' });
    await expect(alert).toContainText('Reference: ref-503');
    await expect(page.getByRole('button', { name: 'Place order' })).toBeEnabled();
  });

  test('Scenario: a signed-out customer signs in at checkout without losing the order', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Afang Soup to your order' }).click();
    await page.getByRole('button', { name: /^Your order, 1 item$/ }).click();
    await page.getByRole('button', { name: 'Checkout' }).click();
    await expect(page.getByText('Sign in to place your order')).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Continue with Google (test)' }).click();
    await expect(page.getByRole('button', { name: 'Place order' })).toBeVisible();
    await expect(page.locator('[data-test="total"]')).toHaveText('₦6,000');
  });

  test('Scenario: the checkout page never scrolls sideways', async ({ page }) => {
    await addToOrderAndCheckout(page);
    await expect(page.getByRole('button', { name: 'Place order' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBe(0);
  });
});
