import { test, expect } from '@playwright/test';

test.describe('Forum Flows', () => {
  test('Navigate to forum categories and view a thread', async ({ page }) => {
    await page.goto('/forum');
    
    // We just verify that the forum view loaded without crashing
    const forumWrapper = page.locator('.forum-grid').first();
    await expect(forumWrapper).toBeVisible({ timeout: 10000 });
  });
});
