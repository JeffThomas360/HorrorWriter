import { test, expect } from '@playwright/test';

test.describe('Authentication Flows', () => {
  test('Turnstile CAPTCHA blocks magic link until completed', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Sign In', { exact: true }).first().click();

    // Click the toggle to reveal the magic link form
    await page.getByRole('button', { name: /Sign in with email link/i }).click();

    const magicLinkBtn = page.getByRole('button', { name: /Send Magic Link/i });
    await expect(magicLinkBtn).toBeDisabled();
  });

  test('Passkey Virtual Authenticator Flow', async ({ page, context }) => {
    const cdpSession = await context.newCDPSession(page);
    await cdpSession.send('WebAuthn.enable');
    await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      }
    });

    await page.goto('/');
    await page.getByText('Sign In', { exact: true }).first().click();

    const passkeyBtn = page.getByRole('button', { name: /SIGN IN WITH PASSKEY/i });
    await expect(passkeyBtn).toBeVisible();
    
    await passkeyBtn.click();

    // Verify the UI reacts to the click by entering the loading state
    const loadingState = page.getByText('Awaiting your device...');
    await expect(loadingState).toBeVisible({ timeout: 5000 });
    
    await cdpSession.send('WebAuthn.disable');
  });
});
