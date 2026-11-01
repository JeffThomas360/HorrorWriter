import { test, expect } from '@playwright/test';
import { setupSupabaseMocks, setupMockAuth, setupTurnstileStub, trapUnmockedSupabase, MOCK_USER_ID } from './mocks';

// What a stranger reads after asking for a link. It must be the same sentence whether or
// not the address has an account.
const LINK_ON_ITS_WAY = 'If that email has an account, a sign-in link is on its way. Check your inbox (and spam).';

const EMAIL_LINK_BUTTON = 'Email me a sign-in link';

// The email form is collapsed behind a small link under the passkey button.
async function openEmailForm(page) {
  await page.getByText('Sign In', { exact: true }).first().click();
  await page.getByRole('button', { name: `Can't sign in? ${EMAIL_LINK_BUTTON}` }).click();
  await expect(page.locator('#email')).toBeVisible();
}

test.describe('Authentication Flows', () => {
  let leaked;

  test.beforeEach(async ({ page }) => {
    // Local dev points at the production Supabase project: anything the mocks do not
    // answer is aborted and fails the test (see trapUnmockedSupabase). This must come
    // before setupSupabaseMocks, which also stubs Turnstile's script with a token of 'tok'.
    leaked = await trapUnmockedSupabase(page);
    await setupSupabaseMocks(page);
  });

  test.afterEach(() => {
    expect(leaked, 'requests that no mock answered').toEqual([]);
  });

  test('Magic link sign-in form submits successfully', async ({ page }) => {
    // Mock the OTP endpoint, keeping what the page sent
    let otp = null;
    await page.route('**/auth/v1/otp*', async (route) => {
      otp = { url: route.request().url(), body: route.request().postDataJSON() };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      });
    });

    await page.goto('/');
    await openEmailForm(page);
    await page.locator('#email').fill('testwriter@horrorwriter.org');

    // The button waits for the Turnstile token (the stub hands one over on render).
    const magicLinkBtn = page.getByRole('button', { name: EMAIL_LINK_BUTTON, exact: true });
    await expect(magicLinkBtn).toBeEnabled();
    await magicLinkBtn.click();

    // A browser that has not passed the age gate gets the neutral sentence: it cannot
    // tell the visitor whether the address has an account.
    await expect(page.getByText(LINK_ON_ITS_WAY)).toBeVisible();

    // The Turnstile token travels with the request; a stranger's request cannot create
    // an account; the link comes back through the callback that offers a passkey.
    expect(otp.body.gotrue_meta_security.captcha_token).toBe('tok');
    expect(otp.body.create_user).toBe(false);
    expect(new URL(otp.url).searchParams.get('redirect_to')).toContain('/auth/callback?via=email');
  });

  test('An address with no account gets the same answer as one with an account', async ({ page }) => {
    // What Supabase Auth says when account creation is off and the address is unknown.
    await page.route('**/auth/v1/otp*', async (route) => {
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 422,
          error_code: 'otp_disabled',
          msg: 'Signups not allowed for otp'
        })
      });
    });

    await page.goto('/');
    await openEmailForm(page);
    await page.locator('#email').fill('nobody@horrorwriter.org');
    await page.getByRole('button', { name: EMAIL_LINK_BUTTON, exact: true }).click();

    const modal = page.locator('.modal-content');
    await expect(modal.getByText(LINK_ON_ITS_WAY)).toBeVisible();
    // Never "No account uses that email", nor the raw error behind it.
    await expect(modal).not.toContainText('No account');
    await expect(modal).not.toContainText(/not allowed/i);
  });

  test('Send stays disabled until the Turnstile check hands over a token', async ({ page }) => {
    // A widget that never answers (registered after the default stub: last route wins).
    await setupTurnstileStub(page, { token: null });

    await page.goto('/');
    await openEmailForm(page);
    await page.locator('#email').fill('testwriter@horrorwriter.org');

    await expect(page.getByRole('button', { name: EMAIL_LINK_BUTTON, exact: true })).toBeDisabled();
    // The two main ways in never wait on the email form's check.
    await expect(page.getByRole('button', { name: 'Sign in with passkey' })).toBeEnabled();
  });

  test('Sign-in request fired before the modal island hydrates still opens the modal', async ({ page }) => {
    // Reproduce the cross-island hydration race deterministically: the Sign In
    // button lives in the UserMenu island while the modal lives in the separate
    // SignInModalWrapper island. If an `open-signin` request is dispatched before
    // the wrapper has hydrated and attached its window listener, the transient
    // event is lost and the modal never opens. Dispatching at DOMContentLoaded
    // (after MainLayout's early inline script runs, before React islands hydrate)
    // forces that ordering. The request must not be lost.
    await page.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        window.dispatchEvent(new CustomEvent('open-signin'));
      });
    });

    await page.goto('/');
    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();
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

    // Passkeys are discoverable: the browser offers the one saved for this site, so no
    // email is asked for. Just press the button.
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
    await openEmailForm(page);

    // Fill normal email
    const emailInput = page.locator('#email');
    await emailInput.fill('testwriter@horrorwriter.org');

    // Fill honeypot field
    const honeypotInput = page.locator('input[name="website_url_hp"]');
    await honeypotInput.fill('http://malicious-bot-url.com');

    const magicLinkBtn = page.getByRole('button', { name: EMAIL_LINK_BUTTON, exact: true });
    await expect(magicLinkBtn).toBeEnabled();
    await magicLinkBtn.click();

    // The bot is told exactly what a real send says for this browser (the age gate is not
    // passed here), so it can't tell it was caught.
    await expect(page.getByText(LINK_ON_ITS_WAY)).toBeVisible();
    await expect(page.getByText(/magic link/i)).toHaveCount(0);

    // Verify Supabase was NEVER called
    expect(otpTriggered).toBe(false);
  });

  test('The email form stays collapsed until asked for; passkey sign-in needs no email', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Sign In', { exact: true }).first().click();

    const modal = page.locator('.modal-content');
    // Passkey leads, and is usable at once: no email, no Turnstile check.
    await expect(modal.getByRole('button', { name: 'Sign in with passkey' })).toBeEnabled();
    await expect(page.locator('#email')).toHaveCount(0);

    // The email link is the fallback, offered as a small link.
    await modal.getByRole('button', { name: `Can't sign in? ${EMAIL_LINK_BUTTON}` }).click();
    await expect(page.locator('#email')).toBeVisible();
    await expect(modal.getByRole('button', { name: EMAIL_LINK_BUTTON, exact: true })).toBeVisible();
  });

  test('"New here? Create an account" is always on offer and leads to the age gate', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Sign In', { exact: true }).first().click();

    const modal = page.locator('.modal-content');
    await modal.getByRole('button', { name: 'New here? Create an account' }).click();

    await expect(modal.getByRole('heading', { name: /Before You/ })).toBeVisible();
    await expect(modal.getByText('When were you born?')).toBeVisible();
  });

  test('Disposable email address is rejected', async ({ page }) => {
    await page.goto('/');
    await openEmailForm(page);

    // Fill blacklisted domain email
    const emailInput = page.locator('#email');
    await emailInput.fill('spamuser@mailinator.com');

    const magicLinkBtn = page.getByRole('button', { name: EMAIL_LINK_BUTTON, exact: true });
    await expect(magicLinkBtn).toBeEnabled();
    await magicLinkBtn.click();

    // Verify rejection error message is shown
    await expect(page.getByText('Temporary or disposable email addresses are not allowed.')).toBeVisible();
  });
});

// After an email-link sign-in, /auth/callback?via=email leaves a flag so the page the
// member lands on can offer a passkey. The flag is only set for a browser that itself
// asked for a link a moment ago (the sign-in modal leaves 'hw:emailLinkRequestedAt'):
// a link someone else requested, forwarded here, must not nudge this device into
// binding its passkey to their account.
test.describe('Passkey nudge after an email link', () => {
  const NUDGE = "Add a passkey so you won't need an email link next time.";
  let leaked;

  test.beforeEach(async ({ page }) => {
    leaked = await trapUnmockedSupabase(page);
    await setupSupabaseMocks(page);
    await setupMockAuth(page);
  });

  test.afterEach(() => {
    expect(leaked, 'requests that no mock answered').toEqual([]);
  });

  test('is offered to the browser that asked for the link', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hw:emailLinkRequestedAt', String(Date.now()));
    });

    await page.goto('/auth/callback?via=email');
    await page.waitForURL('**/profile/');

    await expect(page.getByText(NUDGE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add passkey' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Not now' })).toBeVisible();
    // The flag names the account that signed in, so only that member is ever shown it.
    expect(await page.evaluate(() => localStorage.getItem('hw:passkeyPrompt'))).toBe(MOCK_USER_ID);
  });

  test('is not offered when this browser never asked for a link', async ({ page }) => {
    await page.goto('/auth/callback?via=email');
    await page.waitForURL('**/profile/');
    await expect(page.getByRole('button', { name: /Sign Out/i })).toBeVisible();

    expect(await page.evaluate(() => localStorage.getItem('hw:passkeyPrompt'))).toBeNull();
    await expect(page.getByText(NUDGE)).toHaveCount(0);
  });
});
