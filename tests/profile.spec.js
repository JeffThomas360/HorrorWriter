import { test, expect } from '@playwright/test';
import { setupMockAuth, setupSupabaseMocks, MOCK_PROFILE, MOCK_PASSKEYS } from './mocks';

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

  test('List existing passkeys on profile page', async ({ page }) => {
    await page.goto('/profile');

    // Verify the passkey section exists and shows the mock passkey
    await expect(page.getByRole('heading', { name: /Fast sign-in/i })).toBeVisible();
    await expect(page.getByText(/Passkey/i).first()).toBeVisible();
    await expect(page.getByText(/Added/i)).toBeVisible();
  });

  test('Add a new passkey successfully', async ({ page, context }) => {
    // Enable virtual authenticator for registering a credential
    const cdpSession = await context.newCDPSession(page);
    await cdpSession.send('WebAuthn.enable');
    await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'usb',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      }
    });

    await page.goto('/profile');

    const addBtn = page.getByRole('button', { name: /Add a Passkey/i });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Verify confirmation message
    await expect(page.locator('.form-ok')).toContainText('Passkey added');

    await cdpSession.send('WebAuthn.disable');
  });

  test('Remove a passkey successfully', async ({ page }) => {
    let passkeysList = [...MOCK_PASSKEYS];

    // Setup dynamic route for passkey_credentials
    await page.route('**/rest/v1/passkey_credentials*', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(passkeysList)
        });
      } else if (method === 'DELETE') {
        passkeysList = []; // clear the list on delete
        route.fulfill({
          status: 204,
          contentType: 'application/json'
        });
      }
    });

    await page.goto('/profile');

    // Verify the passkey is shown
    await expect(page.getByRole('button', { name: /Remove/i })).toBeVisible();

    // Handle the window.confirm dialog automatically
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Remove this passkey?');
      await dialog.accept();
    });

    await page.getByRole('button', { name: /Remove/i }).click();

    // Verify the passkey is removed from the UI
    await expect(page.getByText('No passkeys yet.')).toBeVisible();
  });
});
