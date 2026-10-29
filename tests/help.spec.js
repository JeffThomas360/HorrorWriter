import { test, expect } from '@playwright/test';
import {
  setupSupabaseMocks,
  setupMockAuth,
  setupTurnstileStub,
  trapUnmockedSupabase,
  MOCK_TICKET,
  MOCK_TICKET_ID,
  MOCK_USER_ID
} from './mocks';

/*
 * /help/ and member tickets: the front door, the ticket flow, and the Keeper's
 * answer showing up as a banner.
 *
 * Local dev points at the production database, so every spec here puts a tripwire
 * under the mocks (trapUnmockedSupabase). Anything a mock does not claim is aborted
 * and fails the spec instead of reaching the real project. The Turnstile script and
 * the open-ticket function are mocked in setupSupabaseMocks.
 */

test.describe('Help page', () => {
  let leaked;

  test.beforeEach(async ({ page }) => {
    leaked = await trapUnmockedSupabase(page);
    await setupSupabaseMocks(page);
  });

  test.afterEach(() => {
    expect(leaked, 'requests that no mock answered').toEqual([]);
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('renders the heading and a visible "Open a ticket" link', async ({ page }) => {
      await page.goto('/help/');

      await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();

      // The primary call to action is in the server HTML: never hidden until JS runs.
      const link = page.getByRole('link', { name: 'Open a ticket' });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', '#open-ticket');
    });
  });

  test('signed out, the ticket button opens the sign-in modal', async ({ page }) => {
    await page.goto('/help/');

    await page.getByRole('button', { name: 'Sign in to open a ticket' }).click();

    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: /Summon/ })).toBeVisible();
    // Signing in is the whole next step: nothing of the ticket form is on screen yet.
    await expect(page.getByLabel('Subject', { exact: true })).toHaveCount(0);
  });

  test('a signed-in member opens a ticket: topic, form, Send, Sent', async ({ page }) => {
    await setupMockAuth(page);
    await page.goto('/help/');

    await page.getByRole('button', { name: 'Open a ticket' }).click();
    await expect(page.getByRole('heading', { name: "What's it about?" })).toBeVisible();
    await page.getByRole('button', { name: "Something's broken" }).click();

    // A topic with published FAQ answers shows them first, behind "Still need help?".
    // None are published yet, so the form follows directly; either way the spec ends
    // up at the form.
    const stillNeedHelp = page.getByRole('button', { name: 'Still need help?' });
    const subject = page.getByLabel('Subject', { exact: true });
    await expect(stillNeedHelp.or(subject)).toBeVisible();
    if (await stillNeedHelp.isVisible()) await stillNeedHelp.click();

    const subjectText = 'The editor will not save my story';
    const messageText = 'Every time I press save the editor spins and nothing happens.';
    await subject.fill(subjectText);
    await page.getByLabel('Message', { exact: true }).fill(messageText);

    // Send waits for the Turnstile token (the stub hands one over on render).
    const send = page.getByRole('button', { name: 'Send', exact: true });
    await expect(send).toBeEnabled();

    const sent = page.waitForRequest(
      (req) => req.url().includes('/functions/v1/open-ticket') && req.method() === 'POST'
    );
    await send.click();

    const body = (await sent).postDataJSON();
    expect(body).toEqual({
      topic: 'broken',
      subject: subjectText,
      body: messageText,
      captchaToken: 'tok'
    });

    const confirmation = page.getByRole('status').filter({ hasText: 'Sent.' });
    await expect(confirmation).toContainText(
      "You'll see the answer here, on My tickets, and in your notifications."
    );
    await expect(confirmation.getByRole('link', { name: 'My tickets' })).toHaveAttribute(
      'href',
      '/my-tickets/'
    );
    // The form is gone: the same message cannot be sent twice.
    await expect(subject).toHaveCount(0);
  });

  test('Send stays disabled until the Turnstile check hands over a token', async ({ page }) => {
    // A widget that never answers (registered after the default stub: last route wins).
    await setupTurnstileStub(page, { token: null });
    await setupMockAuth(page);
    await page.goto('/help/');

    await page.getByRole('button', { name: 'Open a ticket' }).click();
    await page.getByRole('button', { name: 'Other', exact: true }).click();
    const stillNeedHelp = page.getByRole('button', { name: 'Still need help?' });
    const subject = page.getByLabel('Subject', { exact: true });
    await expect(stillNeedHelp.or(subject)).toBeVisible();
    if (await stillNeedHelp.isVisible()) await stillNeedHelp.click();

    await subject.fill('A question about my account');
    await page.getByLabel('Message', { exact: true }).fill('I would like to ask about something on my account.');

    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  });
});

// The banner's question: this member's answered or closed tickets they have not opened
// (a closing note is Keeper words too; a close without one is marked seen by the server).
const isBannerQuery = (req) =>
  req.url().includes('/rest/v1/tickets') &&
  new URL(req.url()).searchParams.get('status') === 'in.(answered,closed)';

test.describe('Ticket reply banner', () => {
  let leaked;

  test.beforeEach(async ({ page }) => {
    leaked = await trapUnmockedSupabase(page);
  });

  test.afterEach(() => {
    expect(leaked, 'requests that no mock answered').toEqual([]);
  });

  test('an unseen answered ticket shows a banner linking to it', async ({ page }) => {
    await setupSupabaseMocks(page, { tickets: [MOCK_TICKET] });
    await setupMockAuth(page);

    const asked = page.waitForRequest(isBannerQuery);
    await page.goto('/');

    // The banner asks for this member's answered or closed, still-unopened tickets, nobody else's.
    const query = new URL((await asked).url()).searchParams;
    expect(query.get('user_id')).toBe(`eq.${MOCK_USER_ID}`);
    expect(query.get('status')).toBe('in.(answered,closed)');
    expect(query.get('member_seen_at')).toBe('is.null');

    const banner = page.getByRole('status').filter({ hasText: 'The Keeper answered your ticket' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(MOCK_TICKET.subject);
    await expect(banner.getByRole('link')).toHaveAttribute('href', `/my-tickets/#${MOCK_TICKET_ID}`);
  });

  test('a closing note the member has not read shows the banner too', async ({ page }) => {
    const closedWithNote = { ...MOCK_TICKET, status: 'closed', close_reason: 'resolved', member_seen_at: null };
    await setupSupabaseMocks(page, { tickets: [closedWithNote] });
    await setupMockAuth(page);
    await page.goto('/');

    const banner = page.getByRole('status').filter({ hasText: 'The Keeper answered your ticket' });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('link')).toHaveAttribute('href', `/my-tickets/#${MOCK_TICKET_ID}`);
  });

  test('the banner follows the member to other pages', async ({ page }) => {
    await setupSupabaseMocks(page, { tickets: [MOCK_TICKET] });
    await setupMockAuth(page);
    await page.goto('/help/');

    await expect(
      page.getByRole('status').filter({ hasText: 'The Keeper answered your ticket' })
    ).toBeVisible();
  });

  test('no banner when the member has no unseen answer', async ({ page }) => {
    await setupSupabaseMocks(page);
    await setupMockAuth(page);

    const asked = page.waitForRequest(isBannerQuery);
    await page.goto('/');
    await asked;

    // Wait for something that only renders once the page is up, then check the absence.
    await expect(page.getByRole('button', { name: /Notifications/i })).toBeVisible();
    await expect(page.getByText('The Keeper answered your ticket')).toHaveCount(0);
  });

  test('no banner, and no ticket lookup, when signed out', async ({ page }) => {
    await setupSupabaseMocks(page, { tickets: [MOCK_TICKET] });
    const ticketRequests = [];
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/tickets')) ticketRequests.push(req.url());
    });

    await page.goto('/');
    await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible();

    await expect(page.getByText('The Keeper answered your ticket')).toHaveCount(0);
    expect(ticketRequests).toEqual([]);
  });
});
