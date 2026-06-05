import { test, expect } from '@playwright/test';
import { setupMockAuth, setupSupabaseMocks, MOCK_PROFILE, MOCK_MODERATION_FLAGS } from './mocks';

test.describe('Admin Moderation Terminal Flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await setupMockAuth(page);
  });

  test('Non-admin user visiting /moderation directly sees a mock 404 page', async ({ page }) => {
    // Override profile GET to ensure is_admin is false/undefined
    await page.route('**/rest/v1/profiles*', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_PROFILE,
          is_admin: false
        })
      });
    });

    await page.goto('/moderation');
    await expect(page.locator('h1.title')).toContainText('404');
    await expect(page.locator('p.eyebrow')).toContainText('Page Not Found');
    await expect(page.locator('text=Swallowed by the dark')).toBeVisible();
    
    // Terminal link should not be visible in Nav
    await expect(page.locator('text=[Terminal]')).not.toBeVisible();
  });

  test('Admin user sees [Terminal] link and can load Keeper Terminal', async ({ page }) => {
    // Override profile GET to set is_admin to true
    await page.route('**/rest/v1/profiles*', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_PROFILE,
          is_admin: true
        })
      });
    });

    await page.goto('/');
    
    // Check navigation link visibility
    const terminalLink = page.locator('text=[Terminal]');
    await expect(terminalLink).toBeVisible();
    await terminalLink.click();

    // Verify terminal header is visible
    await expect(page.locator('h1.title')).toContainText('KEEPER TERMINAL');
    await expect(page.locator('p.eyebrow')).toContainText('Coven Master Console');
  });

  test('Admin can manage Flagged Queue', async ({ page }) => {
    // Override profile GET to set is_admin to true
    await page.route('**/rest/v1/profiles*', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_PROFILE,
          is_admin: true
        })
      });
    });

    await page.goto('/moderation');

    // Click Flagged Queue tab
    await page.locator('.tab-flags-btn').click();

    // Verify flags from MOCK_MODERATION_FLAGS are rendered
    await expect(page.locator('text=TYPE: STORY')).toBeVisible();
    await expect(page.locator('text=Spam content in Innsmouth')).toBeVisible();
    await expect(page.locator('text=TYPE: CRITIQUE')).toBeVisible();
    await expect(page.locator('text=Reason: "Harassment"')).toBeVisible();

    // 1. Verify "Dismiss Flag" deletes from moderation_flags
    const deletePromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/moderation_flags') && req.method() === 'DELETE'
    );
    await page.locator('button', { hasText: 'Dismiss Flag' }).first().click();
    await deletePromise;
    await expect(page.locator('text=Flag dismissed.')).toBeVisible();

    // 2. Verify "Moderate (Hide)" sets hidden=true in books table and deletes flag
    const patchPromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/book_comments') && req.method() === 'PATCH'
    );
    await page.locator('button', { hasText: 'Moderate (Hide)' }).first().click();
    const patchRequest = await patchPromise;
    const patchData = JSON.parse(patchRequest.postData() || '{}');
    expect(patchData).toEqual({ hidden: true });
  });

  test('Admin can process Screening Queue', async ({ page }) => {
    // Override profile GET to set is_admin to true
    await page.route('**/rest/v1/profiles*', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_PROFILE,
          is_admin: true
        })
      });
    });

    await page.goto('/moderation');

    // Click Screening Queue tab
    await page.locator('.tab-screening-btn').click();

    // Verify unapproved content mock data is rendered
    await expect(page.locator('text=Unapproved Story')).toBeVisible();
    await expect(page.locator('text=Unapproved Critique content')).toBeVisible();
    await expect(page.locator('text=Unapproved Thread')).toBeVisible();

    // 1. Approve content updates approved=true
    const approvePromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/books') && req.method() === 'PATCH'
    );
    await page.locator('.approve-btn').first().click();
    const approveReq = await approvePromise;
    const approveData = JSON.parse(approveReq.postData() || '{}');
    expect(approveData).toEqual({ approved: true });

    // 2. Reject/Hide content updates hidden=true
    const rejectPromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/book_comments') && req.method() === 'PATCH'
    );
    await page.locator('.hide-btn').first().click();
    const rejectReq = await rejectPromise;
    const rejectData = JSON.parse(rejectReq.postData() || '{}');
    expect(rejectData).toEqual({ hidden: true });
  });

  test('Admin can audit Coven Registry and toggle shadowban/screening status', async ({ page }) => {
    // Override profile GET to set is_admin to true
    await page.route('**/rest/v1/profiles*', async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      if (method === 'GET') {
        if (url.includes('handle=ilike.')) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'user-3',
                handle: 'spooky_newbie',
                display_name: 'Spooky Newbie',
                is_admin: false,
                is_shadowbanned: false,
                requires_screening: true
              }
            ])
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...MOCK_PROFILE,
              is_admin: true
            })
          });
        }
      } else if (method === 'PATCH' || method === 'PUT') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok' })
        });
      }
    });

    await page.goto('/moderation');

    // Click Coven Registry tab
    await page.locator('.tab-users-btn').click();

    // Search for a user
    await page.locator('.user-search-input').fill('spooky');
    await page.getByRole('button', { name: 'Search' }).click();

    // Verify search result is rendered
    await expect(page.locator('text=@spooky_newbie')).toBeVisible();
    await expect(page.locator('.screening-badge')).toBeVisible();

    // 1. Toggle Shadowban status
    const shadowbanPromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/profiles') && req.method() === 'PATCH'
    );
    await page.locator('.shadowban-toggle-btn').click();
    const shadowbanReq = await shadowbanPromise;
    const shadowbanData = JSON.parse(shadowbanReq.postData() || '{}');
    expect(shadowbanData).toEqual({ is_shadowbanned: true });

    // 2. Toggle Screening status
    const screeningPromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/profiles') && req.method() === 'PATCH'
    );
    await page.locator('.screening-toggle-btn').click();
    const screeningReq = await screeningPromise;
    const screeningData = JSON.parse(screeningReq.postData() || '{}');
    expect(screeningData).toEqual({ requires_screening: false });
  });
});
