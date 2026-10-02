import { expect, test } from '@playwright/test';
import { mockApi, SIGNED_IN_USER } from './support/mock-api';

test.describe('Feature: sign in with Google', () => {
  test('Scenario: a customer signs in with one tap', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to order' });
    await expect(dialog).toBeVisible();
    const signInRequest = page.waitForRequest('**/api/v1/auth/google');
    await dialog.getByRole('button', { name: 'Continue with Google (test)' }).click();
    expect((await signInRequest).postDataJSON()).toEqual({ credential: 'fake-google-credential' });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Account: Ekaette' })).toBeVisible();
    await expect(page.getByText('Welcome, Ekaette.')).toBeVisible();
  });

  test('Scenario: an existing session is restored on load', async ({ page }) => {
    await mockApi(page, { session: SIGNED_IN_USER });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Account: Ekaette' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);
  });

  test('Scenario: signing out', async ({ page }) => {
    await mockApi(page, { session: SIGNED_IN_USER });
    await page.goto('/');
    await page.getByRole('button', { name: 'Account: Ekaette' }).click();
    const logout = page.waitForRequest('**/api/v1/auth/logout');
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await logout;
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('You’ve signed out.')).toBeVisible();
  });

  test('Scenario: the server refuses the Google sign-in', async ({ page }) => {
    await mockApi(page, {
      signIn: {
        status: 401,
        body: {
          error: {
            code: 'INVALID_GOOGLE_TOKEN',
            message: 'We couldn’t verify your Google sign-in. Please try again.',
            requestId: 'ref-401',
          },
        },
      },
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to order' });
    await dialog.getByRole('button', { name: 'Continue with Google (test)' }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      'We couldn’t verify your Google sign-in.',
    );
    await expect(dialog.getByRole('alert')).toContainText('Reference: ref-401');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('Scenario: sign-in is rate limited', async ({ page }) => {
    await mockApi(page, {
      signIn: {
        status: 429,
        body: {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please wait a moment and try again.',
          },
        },
      },
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Continue with Google (test)' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Too many requests');
  });

  test('Scenario: Google sign-in is blocked, and a retry recovers', async ({ page }) => {
    await mockApi(page, { googleScript: 'blocked' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to order' });
    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText('We couldn’t load Google sign-in.');
    await page.unroute('https://accounts.google.com/gsi/client');
    await mockApi(page);
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(dialog.getByRole('button', { name: 'Continue with Google (test)' })).toBeVisible();
  });

  test('Scenario: closing the dialog with Escape keeps the page usable', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
  });
});
