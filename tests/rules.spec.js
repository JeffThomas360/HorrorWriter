import { test, expect } from '@playwright/test';
import { setupSupabaseMocks } from './mocks';

test.describe('Codex (Rules & Disclaimers) Flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
  });

  test('Navigate to Codex page directly', async ({ page }) => {
    await page.goto('/rules');
    await expect(page.locator('h2.title')).toContainText('The Codex');
    await expect(page.locator('#house-rules')).toBeVisible();
    await expect(page.locator('#critique-code')).toBeVisible();
  });

  test('Footer links route and scroll to Codex sections', async ({ page }) => {
    await page.goto('/');
    
    // Click "House Rules" in footer (scoped to footer to avoid conflicts)
    await page.locator('footer').getByRole('link', { name: 'House Rules' }).click();
    await page.waitForURL('**/rules#house-rules');
    await expect(page.locator('h2.title')).toContainText('The Codex');
    
    // Verify target header is visible
    await expect(page.locator('#house-rules')).toBeVisible();
  });

  test('Sign-in modal rules link routes to Codex and closes modal', async ({ page }) => {
    await page.goto('/');
    
    // Open sign in modal
    await page.getByText('Sign In', { exact: true }).first().click();
    await expect(page.locator('.modal-content')).toBeVisible();

    // Click "House Rules" link in the modal footer (scoped to modal to avoid conflicts)
    await page.locator('.modal-content').getByRole('link', { name: 'House Rules' }).click();

    // Verify it navigated to /rules
    await page.waitForURL('**/rules');

    // Verify modal is closed
    await expect(page.locator('.modal-content')).not.toBeVisible();
  });
});
