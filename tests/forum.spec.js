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
    await expect(page.locator('h2.title')).toContainText(MOCK_THREADS[0].title);
    
    // Verify posts in thread details
    await expect(page.getByText(MOCK_POSTS[0].content)).toBeVisible();
    await expect(page.getByText(MOCK_POSTS[1].content)).toBeVisible();
  });

  test('Create a new thread (authenticated)', async ({ page }) => {
    // Inject mock session
    await setupMockAuth(page);
    
    await page.goto('/forum/new');

    // Fill the title and content
    await page.locator('input[placeholder="A chilling subject..."]').fill('The New Haunted Mansion');
    await page.locator('textarea[placeholder="Speak into the void..."]').fill('I think there is something in the attic...');

    // Submit
    const submitBtn = page.getByRole('button', { name: /Post Thread/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify it redirects back to the forum
    await page.waitForURL('**/forum');
    await expect(page.locator('.forum-grid')).toBeVisible();
  });

  test('Post a reply to a thread (authenticated)', async ({ page }) => {
    // Inject mock session
    await setupMockAuth(page);

    await page.goto(`/forum/thread/${MOCK_THREADS[0].id}`);

    // Verify reply section exists
    await expect(page.getByRole('heading', { name: 'Leave a Reply' })).toBeVisible();

    // Type a reply
    const textarea = page.locator('textarea[placeholder="Speak into the void..."]');
    await textarea.fill('My spine is shivering.');

    // Submit reply
    const replyBtn = page.getByRole('button', { name: /Post Reply/i });
    await expect(replyBtn).toBeEnabled();
    await replyBtn.click();

    // Verify text area is cleared
    await expect(textarea).toHaveValue('');
  });
});
