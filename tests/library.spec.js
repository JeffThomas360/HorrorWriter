import { test, expect } from '@playwright/test';
import { setupMockAuth, setupSupabaseMocks, MOCK_BOOKS, MOCK_BOOK_COMMENTS } from './mocks';

test.describe('Library Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Enable Supabase REST and profiles mocking
    await setupSupabaseMocks(page);
  });

  test('Navigate to library, view book lists and open book reader', async ({ page }) => {
    await page.goto('/library');
    
    // Check main title
    await expect(page.locator('h2.title')).toContainText('Shared Work');

    // Check book card is visible
    await expect(page.getByText(MOCK_BOOKS[0].title).first()).toBeVisible();
    await expect(page.getByText(MOCK_BOOKS[0].lede)).toBeVisible();

    // Click the book card to read
    await page.getByText(MOCK_BOOKS[0].title).first().click();

    // Verify Reader page loaded
    await expect(page.locator('h1.title')).toContainText(MOCK_BOOKS[0].title);
    await expect(page.getByText(MOCK_BOOKS[0].content)).toBeVisible();
  });

  test('Publish a story (authenticated)', async ({ page }) => {
    // Inject mock session
    await setupMockAuth(page);
    
    await page.goto('/library/publish');

    // Verify page title
    await expect(page.locator('h2.title')).toContainText('Publish Story');

    // Fill form fields
    await page.locator('input[placeholder="The Tell-Tale Heart"]').fill('The Fall of the House of Usher');
    await page.locator('input[placeholder="A short hook to draw readers in..."]').fill('An eerie story about family decay.');
    await page.locator('textarea[placeholder^="True!—nervous—"]').fill('During the whole of a dull, dark, and soundless day...');

    // Submit form
    const publishBtn = page.getByRole('button', { name: /Publish Story/i });
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();

    // Verify redirect to library
    await page.waitForURL('**/library');
    await expect(page.locator('h2.title')).toContainText('Shared Work');
  });

  test('Submit a critique on a story (authenticated)', async ({ page }) => {
    // Inject mock session
    await setupMockAuth(page);

    await page.goto('/library');
    
    // Click the book card to read
    await page.getByText(MOCK_BOOKS[0].title).first().click();

    // Verify comments list is loaded
    await expect(page.locator('h3', { hasText: 'Critiques & Responses' })).toBeVisible();
    await expect(page.getByText(MOCK_BOOK_COMMENTS[0].content)).toBeVisible();

    // Verify submit form is visible for authenticated user
    const textSelector = page.locator('textarea[placeholder="Offer constructive dark wisdom..."]');
    await expect(textSelector).toBeVisible();

    // Leave a critique
    await textSelector.fill('Fascinating atmosphere, but the ending could build more tension.');
    await page.getByRole('button', { name: /Post Critique/i }).click();

    // Verify it got submitted (text area cleared)
    await expect(textSelector).toHaveValue('');
  });
});
