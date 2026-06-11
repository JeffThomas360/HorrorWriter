import { test, expect } from '@playwright/test';
import { setupSupabaseMocks, setupMockAuth } from './mocks';

test.describe('Authentication Flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
  });

  test('Magic link sign-in form submits successfully', async ({ page }) => {
    // Mock the OTP endpoint
    await page.route('**/auth/v1/otp*', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      });
    });

    await page.goto('/');
    await page.getByText('Sign In', { exact: true }).first().click();

    const emailInput = page.locator('#email');
    await emailInput.fill('testwriter@horrorwriter.org');

    const magicLinkBtn = page.getByRole('button', { name: /Send Magic Link/i });
    await expect(magicLinkBtn).toBeEnabled();
    await magicLinkBtn.click();

    // Verify success message
    await expect(page.getByText('Check your email for the magic link.')).toBeVisible();
  });

  test('Passkey E2E Registration and Sign-in Flow', async ({ page, context }) => {
    // 1. Enable virtual authenticator (usb transport)
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

    // 2. Log in using Mock Auth (inject session) to access profile
    await setupMockAuth(page);
    await page.goto('/profile');

    // 3. Register the passkey
    const addBtn = page.getByRole('button', { name: /Add a passkey/i });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Verify confirmation message
    await expect(page.locator('.form-ok')).toContainText('Passkey added');

    // 4. Sign out
    await page.getByRole('button', { name: /Sign Out/i }).click();

    // The RequireAuth wrapper will keep us on /profile but automatically open the Sign In modal
    const passkeyBtn = page.getByRole('button', { name: /Sign in with Passkey/i });
    await expect(passkeyBtn).toBeVisible({ timeout: 5000 });

    // Email is required before passkey sign-in
    const signInEmail = page.locator('#email');
    await signInEmail.fill('testwriter@horrorwriter.org');
    await passkeyBtn.click();

    // Verify successful sign-in transitions UI to authenticated state (modal closed, Sign Out shows)
    await expect(page.getByText('Sign Out', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Sign In', { exact: true })).not.toBeVisible();
    
    await cdpSession.send('WebAuthn.disable');
  });

  test('Honeypot trap silently drops bot submissions', async ({ page }) => {
    let otpTriggered = false;

    // Listen to network request
    await page.route('**/auth/v1/otp*', async (route) => {
      otpTriggered = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      });
    });

    await page.goto('/');
    await page.getByText('Sign In', { exact: true }).first().click();

    // Fill normal email
    const emailInput = page.locator('#email');
    await emailInput.fill('testwriter@horrorwriter.org');

    // Fill honeypot field
    const honeypotInput = page.locator('input[name="website_url_hp"]');
    await honeypotInput.fill('http://malicious-bot-url.com');

    const magicLinkBtn = page.getByRole('button', { name: /Send Magic Link/i });
    await expect(magicLinkBtn).toBeEnabled();
    await magicLinkBtn.click();

    // Verify success message is STILL shown to trick the bot
    await expect(page.getByText('Check your email for the magic link.')).toBeVisible();

    // Verify Supabase was NEVER called
    expect(otpTriggered).toBe(false);
  });

  test('Passkey button shows error when email is empty', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Sign In', { exact: true }).first().click();

    // Click passkey without filling email
    await page.getByRole('button', { name: /Sign in with Passkey/i }).click();

    await expect(page.locator('.modal-content')).toContainText('Enter your email address first.');
  });

  test('Disposable email address is rejected', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Sign In', { exact: true }).first().click();

    // Fill blacklisted domain email
    const emailInput = page.locator('#email');
    await emailInput.fill('spamuser@mailinator.com');

    const magicLinkBtn = page.getByRole('button', { name: /Send Magic Link/i });
    await expect(magicLinkBtn).toBeEnabled();
    await magicLinkBtn.click();

    // Verify rejection error message is shown
    await expect(page.getByText('Temporary or disposable email addresses are not allowed.')).toBeVisible();
  });
});
