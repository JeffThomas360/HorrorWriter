import { test, expect } from '@playwright/test';
import { setupMockAuth, setupSupabaseMocks, MOCK_SERIES, MOCK_SERIES_BOOKS, MOCK_BOOKS } from './mocks';

test.describe('My Stories', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAuth(page);
    await setupSupabaseMocks(page);
  });

  test('shows existing series with their books', async ({ page }) => {
    await page.goto('/my-stories');

    await expect(page.getByText('Your Series')).toBeVisible();
    await expect(page.getByText(MOCK_SERIES[0].title).first()).toBeVisible();
    await expect(page.getByText(MOCK_SERIES_BOOKS[0].books.title).first()).toBeVisible();
  });

  test('creates a new series with an initial story', async ({ page }) => {
    await page.goto('/my-stories');

    await page.getByRole('button', { name: '+ New Series' }).click();
    await page.getByPlaceholder('The Hollow Chronicles').fill('A New Series');
    // book-1 is already assigned to MOCK_SERIES in the fixtures; book-2 ("A Standalone
    // Tale") is the one unassigned book available to seed a new series with.
    await page.locator('form select').selectOption({ label: MOCK_BOOKS[1].title });

    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/rest/v1/series') && req.method() === 'POST'
    );

    await page.getByRole('button', { name: 'Create Series' }).click();
    const request = await requestPromise;

    const postData = JSON.parse(request.postData() || '{}');
    expect(postData.title).toBe('A New Series');

    // Toast visibility is skipped in dev — Astro islands have separate Sonner module
    // instances (documented CLAUDE.md; see tests/transcribe.spec.js for precedent). The
    // create form only closes on the mutation's onSuccess, so its disappearance is proof
    // the full create-series-plus-initial-story flow completed.
    await expect(page.getByRole('button', { name: '+ New Series' })).toBeVisible();
  });

  test('assigns an unassigned story to an existing series', async ({ page }) => {
    await page.goto('/my-stories');

    // book-2 ("A Standalone Tale") is unassigned in the fixtures and renders its own
    // "Add to series…" dropdown + Add button under "Your Stories".
    const storyRow = page.locator('li', { hasText: MOCK_BOOKS[1].title });
    await storyRow.locator('select').selectOption({ label: MOCK_SERIES[0].title });

    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/rest/v1/series_books') && req.method() === 'POST'
    );

    await storyRow.getByRole('button', { name: 'Add' }).click();
    const request = await requestPromise;

    // Toast visibility is skipped in dev — Astro islands have separate Sonner module
    // instances (documented CLAUDE.md; see tests/transcribe.spec.js for precedent).
    // Assert on the request payload instead: the right book was attached to the right series.
    const postData = JSON.parse(request.postData() || '{}');
    expect(postData).toMatchObject({ series_id: MOCK_SERIES[0].id, book_id: MOCK_BOOKS[1].id });
  });

  test('reorders a story within a series', async ({ page }) => {
    await page.goto('/my-stories');

    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/rest/v1/series_books') && ['PATCH', 'PUT'].includes(req.method())
    );

    const positionInput = page.getByLabel('Position');
    await positionInput.fill('3');
    await positionInput.blur();

    await requestPromise;
  });

  test('deletes a series after confirmation', async ({ page }) => {
    await page.goto('/my-stories');

    page.on('dialog', dialog => dialog.accept());

    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/rest/v1/series') && req.method() === 'DELETE'
    );

    await page.getByRole('button', { name: 'Delete Series' }).click();
    const request = await requestPromise;

    // Toast visibility is skipped in dev — Astro islands have separate Sonner module
    // instances (documented CLAUDE.md; see tests/transcribe.spec.js for precedent).
    // Confirm the DELETE targeted the right series row instead.
    expect(request.url()).toContain(`id=eq.${MOCK_SERIES[0].id}`);
  });

  test('lists the writer\'s own stories with series assignment', async ({ page }) => {
    await page.goto('/my-stories');

    await expect(page.getByText('Your Stories')).toBeVisible();
    await expect(page.getByText(MOCK_BOOKS[0].title).first()).toBeVisible();
  });
});
