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

    // Set up request listener before clicking save
    const requestPromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/profiles') && (req.method() === 'PUT' || req.method() === 'PATCH' || req.method() === 'POST')
    );

    // Fill new location and bio details
    const locationInput = page.locator('input[placeholder="Ohio"]');
    await locationInput.fill('Transylvania');

    const bioInput = page.locator('textarea');
    await bioInput.fill('I write scary stories in a dark castle.');

    // Save changes
    const saveBtn = page.getByRole('button', { name: /Save changes/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Verify request payload
    const request = await requestPromise;
    const postData = JSON.parse(request.postData() || '{}');
    expect(postData).toEqual({
      handle: 'testwriter',
      display_name: 'Test Writer',
      bio: 'I write scary stories in a dark castle.',
      location: 'Transylvania',
      pronouns: 'they/them',
      website_url: 'https://horrorwriter.org'
    });

    // Verify confirmation message
    await expect(page.locator('.form-ok')).toContainText('Saved');
  });

  test('Profile editor handles validation errors - invalid inputs', async ({ page }) => {
    await page.goto('/profile');

    // 1. Try to input an invalid website URL (no http/https but valid URL format for HTML5 type="url")
    const websiteInput = page.getByLabel('Website');
    await websiteInput.fill('ftp://invalid-website-format.com');

    // Click save
    await page.getByRole('button', { name: /Save changes/i }).click();

    // Verify error is shown
    await expect(page.locator('.form-err')).toContainText('Website must start with http:// or https://');

    // 2. Try to input an invalid handle (too short)
    const handleInput = page.getByLabel('Handle');
    await handleInput.fill('ab');

    // Click save
    await page.getByRole('button', { name: /Save changes/i }).click();

    // Verify error is shown
    await expect(page.locator('.form-err')).toContainText('Handle must be 3-30 chars: a-z, 0-9, hyphens, underscores, or dots only.');
  });

  test('Profile save fails - database error handling', async ({ page }) => {
    // Override profile update to fail
    await page.route('**/rest/v1/profiles*', async (route) => {
      const method = route.request().method();
      if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'That handle is already taken.' })
        });
      } else {
        route.fallback();
      }
    });

    await page.goto('/profile');

    // Save changes
    await page.getByRole('button', { name: /Save changes/i }).click();

    // Verify database error handling in UI
    await expect(page.locator('.form-err')).toContainText('That handle is already taken.');
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

    const addBtn = page.getByRole('button', { name: /Add a passkey/i });
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
    await expect(page.getByText('No passkeys set up yet.')).toBeVisible();
  });
});
