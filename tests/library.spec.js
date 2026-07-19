import { test, expect } from '@playwright/test';
import { setupMockAuth, setupSupabaseMocks, MOCK_BOOKS, MOCK_BOOK_COMMENTS, MOCK_SERIES } from './mocks';

test.describe('Library Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Enable Supabase REST and profiles mocking
    await setupSupabaseMocks(page);
  });

  test('Navigate to library, view book lists and open book reader', async ({ page }) => {
    await page.goto('/library');
    
    // Check main title
    await expect(page.locator('h2')).toContainText('Shared work', { ignoreCase: true });

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
    await expect(page.locator('h2.title')).toContainText('Publish a story', { ignoreCase: true });

    // Set up request listener before clicking submit
    const requestPromise = page.waitForRequest(req => 
      req.url().includes('/rest/v1/books') && req.method() === 'POST'
    );

    // Fill form fields
    await page.locator('input[placeholder="The Tell-Tale Heart"]').fill('The Fall of the House of Usher');
    await page.locator('input[placeholder="A short hook to draw readers in…"]').fill('An eerie story about family decay.');
    await page.locator('textarea[placeholder^="True!—nervous—"]').fill('During the whole of a dull, dark, and soundless day...');

    // Submit form
    const publishBtn = page.getByRole('button', { name: /Publish Story/i });
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();

    // Verify request payload
    const request = await requestPromise;
    const postData = JSON.parse(request.postData() || '{}');
    expect(postData).toEqual({
      title: 'The Fall of the House of Usher',
      lede: 'An eerie story about family decay.',
      cover: 'blood',
      content: 'During the whole of a dull, dark, and soundless day...',
      author_id: 'da141b7f-712c-47bc-9173-mockuserid01'
    });

    // Verify redirect to reader
    await page.waitForURL('**/library/read/**');
    await expect(page.locator('h1.title')).toContainText(MOCK_BOOKS[0].title);
  });

  test('Publish a story fails - error handling', async ({ page }) => {
    // Inject mock session
    await setupMockAuth(page);

    // Override the books POST request to return a database error
    await page.route('**/rest/v1/books*', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Database RLS / insertion policy failure' })
        });
      } else {
        route.fallback();
      }
    });

    await page.goto('/library/publish');

    // Fill form fields
    await page.locator('input[placeholder="The Tell-Tale Heart"]').fill('Failed Story');
    await page.locator('input[placeholder="A short hook to draw readers in…"]').fill('This will not save.');
    await page.locator('textarea[placeholder^="True!—nervous—"]').fill('Some spooky lines...');

    // Submit
    const publishBtn = page.getByRole('button', { name: /Publish Story/i });
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();

    // Verify error message is rendered
    await expect(page.locator('.form-err')).toContainText('Database RLS / insertion policy failure');

    // Verify we are still on the publish page
    expect(page.url()).toContain('/library/publish');
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
    const textSelector = page.locator('textarea[placeholder="Offer constructive dark wisdom…"]');
    await expect(textSelector).toBeVisible();

    // Leave a critique
    await textSelector.fill('Fascinating atmosphere, but the ending could build more tension.');
    await page.getByRole('button', { name: /Post Critique/i }).click();

    // Verify it got submitted (text area cleared)
    await expect(textSelector).toHaveValue('');
  });

  test('Publish a story with a series selected attaches it', async ({ page }) => {
    await setupMockAuth(page);
    await page.goto('/library/publish');

    await expect(page.getByText('Part of a series?')).toBeVisible();
    await page.locator('form select').selectOption({ label: MOCK_SERIES[0].title });

    await page.locator('input[placeholder="The Tell-Tale Heart"]').fill('A Sequel');
    await page.locator('input[placeholder="A short hook to draw readers in…"]').fill('Continuing the descent.');
    await page.locator('textarea[placeholder^="True!—nervous—"]').fill('The house remembered.');

    const seriesRequestPromise = page.waitForRequest(req =>
      req.url().includes('/rest/v1/series_books') && req.method() === 'POST'
    );

    await page.getByRole('button', { name: /Publish Story/i }).click();
    await seriesRequestPromise;

    await page.waitForURL('**/library/read/**');
  });
});
