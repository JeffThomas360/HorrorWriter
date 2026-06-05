import { test, expect } from '@playwright/test';
import { setupMockAuth, setupSupabaseMocks, MOCK_THREADS, MOCK_BOOKS, MOCK_POSTS, MOCK_BOOK_COMMENTS } from './mocks';

test.describe('Community Moderation Flags', () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await setupMockAuth(page);
  });

  test('Flag/Report a story successfully', async ({ page }) => {
    // Override books GET to set author_id to a different user so the report button is visible
    await page.route('**/rest/v1/books*', async (route) => {
      const url = route.request().url();
      if (url.includes('id=eq.')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...MOCK_BOOKS[0],
            author_id: 'other-author-id'
          })
        });
      } else {
        route.fallback();
      }
    });

    await page.goto('/library');
    
    // Open the book reader
    await page.getByText(MOCK_BOOKS[0].title).first().click();
    await expect(page.locator('h1.title')).toContainText(MOCK_BOOKS[0].title);

    // Setup verification request
    const requestPromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/moderation_flags') && req.method() === 'POST'
    );

    // Handle dialog sequence
    page.on('dialog', async (dialog) => {
      if (dialog.message().includes('Reason for report')) {
        await dialog.accept('Spam content');
      } else {
        await dialog.accept();
      }
    });

    // Click story Report button
    await page.locator('.eyebrow').getByRole('button', { name: 'Report' }).click();

    // Verify request payload
    const request = await requestPromise;
    const postData = JSON.parse(request.postData() || '{}');
    expect(postData).toEqual({
      reporter_id: 'da141b7f-712c-47bc-9173-mockuserid01',
      target_type: 'story',
      target_id: MOCK_BOOKS[0].id,
      reason: 'Spam content'
    });
  });

  test('Flag/Report a critique successfully', async ({ page }) => {
    await page.goto(`/library/read/${MOCK_BOOKS[0].id}`);
    await expect(page.locator('h3', { hasText: 'Critiques & Responses' })).toBeVisible();

    const requestPromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/moderation_flags') && req.method() === 'POST'
    );

    page.on('dialog', async (dialog) => {
      if (dialog.message().includes('Reason for report')) {
        await dialog.accept('Harassment');
      } else {
        await dialog.accept();
      }
    });

    // Click flag button on the comment (scoped to the card and not self)
    await page.locator('.card .flag-btn').first().click();

    // Verify request payload
    const request = await requestPromise;
    const postData = JSON.parse(request.postData() || '{}');
    expect(postData).toEqual({
      reporter_id: 'da141b7f-712c-47bc-9173-mockuserid01',
      target_type: 'critique',
      target_id: MOCK_BOOK_COMMENTS[0].id,
      reason: 'Harassment'
    });
  });

  test('Flag/Report a thread and its replies successfully', async ({ page }) => {
    // Override threads GET to set author_id to a different user so the report button is visible
    await page.route('**/rest/v1/threads*', async (route) => {
      const url = route.request().url();
      if (url.includes('id=eq.')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...MOCK_THREADS[0],
            author_id: 'other-author-id'
          })
        });
      } else {
        route.fallback();
      }
    });

    await page.goto(`/forum/thread/${MOCK_THREADS[0].id}`);
    await expect(page.locator('h1.title')).toContainText(MOCK_THREADS[0].title);

    // 1. Report the thread itself
    const threadRequestPromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/moderation_flags') && req.method() === 'POST'
    );

    let submitReason = 'Inappropriate topic';
    page.on('dialog', async (dialog) => {
      if (dialog.message().includes('Reason for report')) {
        await dialog.accept(submitReason);
      } else {
        await dialog.accept();
      }
    });

    await page.locator('.title').getByRole('button', { name: 'Report' }).click();

    const threadRequest = await threadRequestPromise;
    const threadPostData = JSON.parse(threadRequest.postData() || '{}');
    expect(threadPostData).toEqual({
      reporter_id: 'da141b7f-712c-47bc-9173-mockuserid01',
      target_type: 'thread',
      target_id: MOCK_THREADS[0].id,
      reason: 'Inappropriate topic'
    });

    // 2. Report a reply post in the thread
    const postRequestPromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/moderation_flags') && req.method() === 'POST'
    );

    submitReason = 'Troll comment';
    await page.locator('.card').filter({ hasText: 'Agreed' }).locator('.flag-btn').click();

    const postRequest = await postRequestPromise;
    const postPostData = JSON.parse(postRequest.postData() || '{}');
    expect(postPostData).toEqual({
      reporter_id: 'da141b7f-712c-47bc-9173-mockuserid01',
      target_type: 'post',
      target_id: MOCK_POSTS[1].id,
      reason: 'Troll comment'
    });
  });
});
