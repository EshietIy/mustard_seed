import { expect, test } from '@playwright/test';
import { mockApi, SIGNED_IN_USER } from './support/mock-api';

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
