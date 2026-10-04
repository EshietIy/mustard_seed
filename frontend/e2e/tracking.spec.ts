import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';

const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';

const tracked = (status: string) => ({
  orderNumber: '#MS-0001',
  status,
  fulfilment: 'delivery',
  branch: { id: 'calabar', city: 'Calabar' },
  items: [
    {
      menuItemId: 'i-afang',
      name: 'Afang Soup',
      unitPriceKobo: 450000,
      quantity: 1,
      lineTotalKobo: 450000,
    },
  ],
  subtotalKobo: 450000,
  deliveryFeeKobo: 150000,
  totalKobo: 600000,
  currency: 'NGN',
  contact: { fullName: 'Ekaette Bassey', phone: '+2348031234567' },
  delivery: { streetAddress: '12 Marian Road', city: 'Calabar' },
  createdAt: '2026-10-05T11:00:00Z',
  paymentExpiresAt: '2026-10-05T11:15:00Z',
  estimatedReadyAt: '2026-10-05T18:45:00Z',
  payment: { status: 'success', channel: 'card', paidAt: '2026-10-05T11:05:00Z' },
});

test.describe('Feature: tracking an order from the email link', () => {
  test('Scenario: a signed-out visitor follows the order as it moves through the kitchen', async ({
    page,
  }) => {
    await page.clock.install();
    await mockApi(page, {
      track: [
        { status: 200, body: tracked('paid') },
        { status: 200, body: tracked('out_for_delivery') },
      ],
    });
    await page.goto(`/track/${TOKEN}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Order #MS-0001');
    await expect(page.getByText('Paid — in the kitchen')).toBeVisible();
    await expect(page.getByText('Estimated arrival: 7:45pm')).toBeVisible();
    await expect(page.getByText('12 Marian Road')).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText('Confirmed');

    await page.clock.fastForward(20_000);
    await expect(page.getByText('Out for delivery')).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText('Ready');
  });

  test('Scenario: a broken link explains what to do', async ({ page }) => {
    await mockApi(page);
    await page.goto('/track/not-a-real-token');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'We couldn’t find this order.',
    );
    await expect(page.getByText('Check the link in your confirmation email')).toBeVisible();
  });

  test('Scenario: the server fails and a retry recovers', async ({ page }) => {
    await mockApi(page, {
      track: [
        { status: 503, body: { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'ref-track' } } },
        { status: 200, body: tracked('preparing') },
      ],
    });
    await page.goto(`/track/${TOKEN}`);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('We couldn’t load this order.');
    await expect(alert).toContainText('Reference: ref-track');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('[aria-current="step"]')).toHaveText('Preparing');
  });
});
