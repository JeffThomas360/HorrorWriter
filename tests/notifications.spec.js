import { test, expect } from '@playwright/test';
import { setupMockAuth, setupSupabaseMocks } from './mocks';

test.describe('Notifications', () => {
  test('bell is not shown when signed out', async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.goto('/');

    await expect(page.getByRole('button', { name: /Notifications/i })).toHaveCount(0);
  });

  test('bell shows unread count badge', async ({ page }) => {
    await setupSupabaseMocks(page);
    await setupMockAuth(page);
    await page.goto('/');

    const bell = page.getByRole('button', { name: /Notifications \(2 unread\)/i });
    await expect(bell).toBeVisible();
    await expect(bell.locator('span')).toHaveText('2');
  });

  test('opening the bell shows the notification list', async ({ page }) => {
    await setupSupabaseMocks(page);
    await setupMockAuth(page);
    await page.goto('/');

    await page.getByRole('button', { name: /Notifications/i }).click();

    await expect(page.getByText('Your report was resolved').first()).toBeVisible();
    await expect(page.getByText('Your post was hidden')).toBeVisible();
  });

  test('clicking an unread notification marks it read', async ({ page }) => {
    await setupSupabaseMocks(page);
    await setupMockAuth(page);
    await page.goto('/');

    await page.getByRole('button', { name: /Notifications/i }).click();

    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/rest/v1/notifications') && req.method() === 'PATCH'
    );

    await page.getByText('Your post was hidden').click();

    const request = await requestPromise;
    expect(request.url()).toContain('id=eq.notif-2');
    const postData = JSON.parse(request.postData() || '{}');
    expect(postData).toHaveProperty('read_at');
  });

  test('mark all read sends a bulk update for the user', async ({ page }) => {
    await setupSupabaseMocks(page);
    await setupMockAuth(page);
    await page.goto('/');

    await page.getByRole('button', { name: /Notifications/i }).click();

    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/rest/v1/notifications') && req.method() === 'PATCH'
    );

    await page.getByRole('button', { name: /Mark all read/i }).click();

    const request = await requestPromise;
    expect(request.url()).not.toContain('notifications?id=eq.');
    expect(request.url()).toContain('user_id=eq.');
    expect(request.url()).toContain('read_at=is.null');
  });

  test('shows empty state when there are no notifications', async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.route('**/rest/v1/notifications*', async (route) => {
      const method = route.request().method();
      if (method === 'HEAD') {
        route.fulfill({
          status: 200,
          headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' }
        });
      } else if (method === 'GET') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
    });
    await setupMockAuth(page);
    await page.goto('/');

    await page.getByRole('button', { name: /^Notifications$/i }).click();

    await expect(page.getByText('No notifications yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Mark all read/i })).toHaveCount(0);
  });
});
