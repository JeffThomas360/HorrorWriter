import { test, expect } from '@playwright/test';
import { setupSupabaseMocks } from './mocks';

test.describe('Mobile navigation', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.goto('/');
  });

  test('hamburger button is visible on mobile, desktop nav is hidden', async ({ page }) => {
    await expect(page.getByRole('button', { name: /open navigation menu/i })).toBeVisible();
    // Desktop nav links should not be visible at this viewport
    const desktopNav = page.locator('nav.hidden.md\\:flex');
    await expect(desktopNav).toBeHidden();
  });

  test('hamburger opens and closes mobile menu', async ({ page }) => {
    const btn = page.locator('#mobile-menu-btn');
    const menu = page.locator('#mobile-menu');

    await expect(menu).toBeHidden();
    await btn.click();
    await expect(menu).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');

    await btn.click();
    await expect(menu).toBeHidden();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('all nav links are reachable in mobile menu', async ({ page }) => {
    await page.getByRole('button', { name: /open navigation menu/i }).click();
    const menu = page.locator('#mobile-menu');
    await expect(menu.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'The Crypt' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Library' })).toBeVisible();
  });

  test('clicking a nav link closes the menu', async ({ page }) => {
    await page.getByRole('button', { name: /open navigation menu/i }).click();
    await page.locator('#mobile-menu').getByRole('link', { name: 'The Crypt' }).click();
    await page.waitForURL('**/forum**');
    await expect(page.locator('#mobile-menu')).toBeHidden();
  });

  test('Escape key closes the menu', async ({ page }) => {
    await page.getByRole('button', { name: /open navigation menu/i }).click();
    await expect(page.locator('#mobile-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#mobile-menu')).toBeHidden();
  });
});
