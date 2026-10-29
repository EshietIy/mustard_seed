import { expect, test } from '@playwright/test';
import { menuFixture, mockApi } from './support/mock-api';

test.describe('Feature: landing page', () => {
  test('Scenario: every section from the design renders with live data and placeholders', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Calabar flavour, at your door.',
    );
    await expect(page.getByRole('heading', { name: 'Top dishes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Our menu' })).toBeVisible();
    const footer = page.locator('footer#visit');
    await expect(footer).toContainText('[CALABAR ADDRESS]');
    await expect(footer).toContainText('[PHONE / WHATSAPP]');
    await expect(footer).toContainText('97 Tunde Ukpehe (Mitama), Uyo');
    await expect(footer).toContainText('Daily 8am – 11pm');
    await expect(footer).toContainText('Online orders close 10:30pm');
  });

  test('Scenario: the hero info cards show the delivery fee and hours on wider screens', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'The design hides the info cards on phones.');
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByText('anywhere in Calabar')).toBeVisible();
    await expect(page.getByText('Open 8am – 11pm')).toBeVisible();
  });

  test('Scenario: menu cards show placeholders, real prices, badges and sold-out items', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/');
    const menu = page.locator('#menu');
    const edikang = menu.getByRole('article').filter({ hasText: 'Edikang Ikong' });
    await expect(edikang).toContainText('[PRICE]');
    await expect(edikang).toContainText('Signature');
    await expect(menu.getByRole('article').filter({ hasText: 'Afang Soup' })).toContainText(
      '₦4,500',
    );
    await expect(
      menu.getByRole('article').filter({ hasText: 'Atama Soup' }).getByRole('button'),
    ).toBeDisabled();
  });

  test('Scenario: a tall photo keeps the same frame as the placeholder', async ({ page }) => {
    const menu = menuFixture();
    const soups = menu.categories[0]!.items as Array<Record<string, unknown>>;
    soups[1]!.image = {
      thumbnailUrl: 'https://img.test/afang/thumb.webp',
      fullUrl: 'https://img.test/afang/full.webp',
    };
    await mockApi(page, { menu: { status: 200, body: menu } });
    await page.route('https://img.test/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700"><rect width="400" height="700" fill="black"/></svg>',
      }),
    );
    await page.goto('/');
    const cards = page.locator('#menu').getByRole('article');
    const photo = cards.filter({ hasText: 'Afang Soup' }).getByRole('img', { name: 'Afang Soup' });
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(700);
    const frame = async (name: string) =>
      (await cards.filter({ hasText: name }).locator('.media').boundingBox())!;
    const placeholder = await frame('Edikang Ikong');
    const real = await frame('Afang Soup');
    expect(Math.abs(real.height - placeholder.height)).toBeLessThan(1);
    expect(Math.abs(real.height - (real.width * 260) / 400)).toBeLessThan(1);
  });

  test('Scenario: house signatures appear under Top dishes and can be added', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    const top = page.locator('#top-dishes');
    await expect(top.getByRole('article')).toHaveCount(1);
    await top.getByRole('button', { name: 'Add Edikang Ikong to your order' }).click();
    await expect(page.getByText('Added Edikang Ikong to your order')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Your order, 1 item$/ })).toBeVisible();
  });

  test('Scenario: category pills, including "All" and an empty category', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'Fresh juices' }).click();
    await expect(page.getByRole('tab', { name: 'Fresh juices' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('#menu').getByRole('article')).toHaveCount(3);
    await page.getByRole('tab', { name: 'Continental' }).click();
    await expect(
      page.getByText('More dishes are coming to this part of the menu soon.'),
    ).toBeVisible();
  });

  test('Scenario: searching from the hero filters the menu', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Search the menu' }).fill('fish');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const menu = page.locator('#menu');
    await expect(menu.getByRole('article')).toHaveCount(1);
    await expect(menu.getByRole('heading', { name: 'Fisherman Soup' })).toBeInViewport();
    await expect(menu.getByRole('searchbox')).toHaveValue('fish');
  });

  test('Scenario: a Quick find chip finds the fresh juices', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Fresh juice', exact: true }).click();
    await expect(page.locator('#menu').getByRole('heading', { level: 3 })).toHaveText([
      'Zobo',
      'Pineapple & ginger',
      'Watermelon',
    ]);
  });

  test('Scenario: a search with no matches can be cleared', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    const menu = page.locator('#menu');
    await menu.getByRole('searchbox').fill('pizza');
    await expect(menu).toContainText('No dishes match “pizza”.');
    await menu.getByRole('button', { name: 'Clear search' }).click();
    await expect(menu.getByRole('article')).toHaveCount(7);
  });

  test('Scenario: the photo carousel moves between slides', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByText('1 / 5 · Photo coming')).toBeVisible();
    await page.getByRole('button', { name: 'Previous photo' }).click();
    await expect(page.getByText('5 / 5 · Fresh juices, pressed daily')).toBeVisible();
    await page.getByRole('button', { name: 'Photo 4: The bar' }).click();
    await expect(page.getByText('4 / 5 · The bar')).toBeVisible();
  });

  test('Scenario: the slideshow plays by itself and can be paused', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.clock.install();
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByText('1 / 5 · Photo coming')).toBeVisible();
    await page.clock.runFor(6_000);
    await expect(page.getByText('2 / 5 · Photo coming')).toBeVisible();
    await page.getByRole('button', { name: 'Pause the slideshow' }).click();
    await page.mouse.move(0, 0);
    await page.clock.runFor(30_000);
    await expect(page.getByText('2 / 5 · Photo coming')).toBeVisible();
    await page.getByRole('button', { name: 'Play the slideshow' }).click();
    await page.mouse.move(0, 0);
    await page.clock.runFor(6_000);
    await expect(page.getByText('3 / 5 · Photo coming')).toBeVisible();
  });

  test('Scenario: visitors who ask for less motion get a still slideshow', async ({ page }) => {
    await page.clock.install();
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play the slideshow' })).toBeVisible();
    await page.clock.runFor(30_000);
    await expect(page.getByText('1 / 5 · Photo coming')).toBeVisible();
  });

  test('Scenario: the menu button on phones opens the section links', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'The menu button only shows on phones.');
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Order now' })).toBeHidden();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.locator('#mobile-menu').getByRole('link', { name: 'Visit us' }).click();
    await expect(page.locator('#mobile-menu')).toHaveCount(0);
    await expect(page.locator('footer#visit')).toBeInViewport();
  });

  test('Scenario: building an order and seeing it survive a reload', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    const menu = page.locator('#menu');
    await menu.getByRole('button', { name: 'Add Afang Soup to your order' }).click();
    await menu.getByRole('button', { name: 'Add Afang Soup to your order' }).click();
    await menu.getByRole('button', { name: 'Add Edikang Ikong to your order' }).click();
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
    await expect(page.getByRole('heading', { name: 'Top dishes' })).toHaveCount(0);
    await page.unroute('http://api.test/api/v1/menu');
    await mockApi(page);
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(
      page.locator('#menu').getByRole('heading', { name: 'Edikang Ikong' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top dishes' })).toBeVisible();
  });

  test('Scenario: the menu API is unreachable', async ({ page }) => {
    await mockApi(page, { menu: 'abort' });
    await page.goto('/');
    await expect(
      page.getByRole('alert').filter({ hasText: 'We couldn’t load the menu.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  for (const width of [375, 768, 1280, 1440, 1920]) {
    test(`Scenario: the page never scrolls sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockApi(page);
      await page.goto('/');
      await expect(
        page.locator('#menu').getByRole('heading', { name: 'Edikang Ikong' }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBe(0);
    });
  }
});
