import { test, expect } from '@playwright/test';
import { setupMockAuth, setupSupabaseMocks, MOCK_PROFILE } from './mocks';

test.describe('Profile Editor Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Enable Supabase REST and profiles mocking
    await setupSupabaseMocks(page);
    // Inject mock session
    await setupMockAuth(page);
  });

  test('View profile details in editor', async ({ page }) => {
    await page.goto('/profile');

    // Verify title
    await expect(page.locator('h2.title')).toContainText('Edit profile');

    // Verify input fields are pre-populated with mock profile data
    await expect(page.locator('input[value="testwriter"]')).toBeVisible();
    await expect(page.locator('input[value="Test Writer"]')).toBeVisible();
    await expect(page.locator('textarea')).toHaveValue(MOCK_PROFILE.bio);
    await expect(page.locator('input[placeholder="Ohio"]')).toHaveValue(MOCK_PROFILE.location);
    await expect(page.locator('input[placeholder="she/her, they/them, …"]')).toHaveValue(MOCK_PROFILE.pronouns);
  });

  test('Modify and save profile details successfully', async ({ page }) => {
    await page.goto('/profile');

    // Fill new location and bio details
    const locationInput = page.locator('input[placeholder="Ohio"]');
    await locationInput.fill('Transylvania');

    const bioInput = page.locator('textarea');
    await bioInput.fill('I write scary stories in a dark castle.');

    // Save changes
    const saveBtn = page.getByRole('button', { name: /Save changes/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Verify confirmation message
    await expect(page.locator('.form-ok')).toContainText('Saved');
  });
});
