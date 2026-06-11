import { test, expect } from '@playwright/test';
import { setupMockAuth, setupSupabaseMocks, MOCK_THREADS, MOCK_POSTS } from './mocks';

test.describe('Forum Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Enable Supabase REST and profiles mocking
    await setupSupabaseMocks(page);
  });

  test('Navigate to forum, view categories and open thread details', async ({ page }) => {
    await page.goto('/forum');
    
    // Check main layout
    const forumWrapper = page.locator('.forum-grid');
    await expect(forumWrapper).toBeVisible();

    // Check thread titles rendered from mock
    await expect(page.getByText(MOCK_THREADS[0].title)).toBeVisible();
    await expect(page.getByText(MOCK_THREADS[1].title)).toBeVisible();

    // Click a thread to navigate to ThreadView
    await page.getByText(MOCK_THREADS[0].title).click();
    await expect(page.locator('h1.title')).toContainText(MOCK_THREADS[0].title);
    
    // Verify posts in thread details
    await expect(page.getByText(MOCK_POSTS[0].content)).toBeVisible();
    await expect(page.getByText(MOCK_POSTS[1].content)).toBeVisible();
  });

  test('Create a new thread (authenticated)', async ({ page }) => {
    // Inject mock session
    await setupMockAuth(page);
    
    await page.goto('/forum/new');

    // Set up request listener before clicking submit
    const requestPromise = page.waitForRequest(req => 
      req.url().includes('/rpc/create_thread_with_post') && req.method() === 'POST'
    );

    // Fill the title and content
    await page.locator('input[placeholder="A chilling subject…"]').fill('The New Haunted Mansion');
    await page.locator('textarea.md-textarea').fill('I think there is something in the attic...');

    // Submit
    const submitBtn = page.getByRole('button', { name: /Post Thread/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify request payload
    const request = await requestPromise;
    const postData = JSON.parse(request.postData() || '{}');
    expect(postData).toEqual({
      p_title: 'The New Haunted Mansion',
      p_category_id: 'cat-1',
      p_content: 'I think there is something in the attic...'
    });

    // Verify it redirects back to the forum
    await page.waitForURL('**/forum');
    await expect(page.locator('.forum-grid')).toBeVisible();
  });

  test('Create a new thread fails - error handling', async ({ page }) => {
    // Inject mock session
    await setupMockAuth(page);

    // Override the RPC call to return a database error
    await page.route('**/rest/v1/rpc/create_thread_with_post*', async (route) => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Database constraint violation' })
      });
    });

    await page.goto('/forum/new');

    // Fill the title and content
    await page.locator('input[placeholder="A chilling subject…"]').fill('Broken Thread');
    await page.locator('textarea.md-textarea').fill('Will fail to submit.');

    // Submit
    const submitBtn = page.getByRole('button', { name: /Post Thread/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify error message is rendered
    await expect(page.locator('.form-err')).toContainText('Database constraint violation');

    // Verify we are still on the create page
    expect(page.url()).toContain('/forum/new');
  });

  test('Post a reply to a thread (authenticated)', async ({ page }) => {
    // Inject mock session
    await setupMockAuth(page);

    await page.goto(`/forum/thread/${MOCK_THREADS[0].id}`);

    // Verify reply section exists
    await expect(page.getByRole('heading', { name: 'Leave a Reply' })).toBeVisible();

    // Type a reply
    const textarea = page.locator('textarea.md-textarea');
    await textarea.fill('My spine is shivering.');

    // Submit reply
    const replyBtn = page.getByRole('button', { name: /Post Reply/i });
    await expect(replyBtn).toBeEnabled();
    await replyBtn.click();

    // Verify text area is cleared
    await expect(textarea).toHaveValue('');
  });
});
