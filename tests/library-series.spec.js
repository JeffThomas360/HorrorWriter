import { test, expect } from '@playwright/test';
import {
  setupSupabaseMocks,
  setupSeriesPartsMock,
  setupSeriesReaderMocks,
  MOCK_SERIES,
  MOCK_SERIES_PARTS
} from './mocks';

/*
 * Reader-side coverage for Story Series — Task 7 of the series-page plan.
 *
 * This is the coverage whose absence let series-hub-500 sit broken in
 * production for the entire life of the feature: SeriesHub.jsx default-imported
 * Providers, which threw during SSR before frontmatter ran, so every
 * /library/series/[id] request returned 500. Nothing tested this route.
 *
 * The first test below is the explicit guard for that. It asserts on the HTTP
 * status rather than on rendered content, because the failure mode was a
 * server-side 500 — asserting only on DOM would report it as a vague timeout.
 */

const SERIES = MOCK_SERIES[0];
const seriesUrl = `/library/series/${SERIES.id}`;

test.describe('Series Hub Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await setupSeriesPartsMock(page);   // must come after: last route wins
  });

  // Astro's dev toolbar is injected on every page in dev mode and Playwright
  // pierces its shadow DOM by default, so unscoped `page.locator('h1')` picks
  // up the toolbar's own panels too ("Audit", "Settings", "Featured
  // integrations" are the toolbar's labels, not the app's). `.series-shell`
  // is the wrapper [id].astro renders around SeriesHub — scope to it.
  const shell = (page) => page.locator('.series-shell');

  test('route returns 200, not a 500 (series-hub-500 regression guard)', async ({ page }) => {
    const response = await page.goto(seriesUrl);

    expect(
      response.status(),
      'SSR 500 — check that SeriesHub.jsx uses the NAMED withProviders import'
    ).toBe(200);
  });

  test('renders series title, byline, description and part count', async ({ page }) => {
    await page.goto(seriesUrl);

    await expect(shell(page).locator('h1')).toContainText(SERIES.title);
    await expect(shell(page).getByText(`A series by @${SERIES.profiles.handle}`)).toBeVisible();
    await expect(shell(page).getByText(SERIES.description)).toBeVisible();
    await expect(shell(page).getByText(`${MOCK_SERIES_PARTS.length} Stories`)).toBeVisible();
  });

  test('lists every part, in sort_order', async ({ page }) => {
    await page.goto(seriesUrl);

    const titles = MOCK_SERIES_PARTS.map((p) => p.books.title);

    for (const title of titles) {
      await expect(shell(page).getByRole('heading', { name: title })).toBeVisible();
    }

    // Order matters — the hub is a reading order, not a list.
    const rendered = await shell(page).locator('h2').allTextContents();
    expect(rendered).toEqual(titles);
  });

  test('numbers the parts 1..n rather than by sort_order', async ({ page }) => {
    await page.goto(seriesUrl);

    // sort_order is zero-based in the data; the UI must show 1-based positions.
    for (let i = 0; i < MOCK_SERIES_PARTS.length; i++) {
      await expect(shell(page).getByText(`▶ ${i + 1}`, { exact: true })).toBeVisible();
    }
    await expect(shell(page).getByText('▶ 0', { exact: true })).toHaveCount(0);
  });

  test('shows each part teaser', async ({ page }) => {
    await page.goto(seriesUrl);

    for (const part of MOCK_SERIES_PARTS) {
      await expect(shell(page).getByText(part.books.series_teaser)).toBeVisible();
    }
  });

  test('every START READING link points at its own story', async ({ page }) => {
    await page.goto(seriesUrl);

    const links = shell(page).getByRole('link', { name: /START READING/i });
    await expect(links).toHaveCount(MOCK_SERIES_PARTS.length);

    for (let i = 0; i < MOCK_SERIES_PARTS.length; i++) {
      await expect(links.nth(i)).toHaveAttribute(
        'href',
        `/library/read/${MOCK_SERIES_PARTS[i].book_id}`
      );
    }
  });

  test('can start reading from a middle part, not just the first', async ({ page }) => {
    await page.goto(seriesUrl);

    // Part 2 specifically: starting anywhere in the series is the point of the hub.
    await shell(page).getByRole('link', { name: /START READING/i }).nth(1).click();

    await page.waitForURL(`**/library/read/${MOCK_SERIES_PARTS[1].book_id}`);
    expect(page.url()).toContain(`/library/read/${MOCK_SERIES_PARTS[1].book_id}`);
  });

  test('a series with a single part reads "1 Story", not "1 Stories"', async ({ page }) => {
    await setupSeriesPartsMock(page, [MOCK_SERIES_PARTS[0]]);
    await page.goto(seriesUrl);

    await expect(shell(page).getByText('1 Story', { exact: true })).toBeVisible();
  });

  test('an unknown series id renders "Series not found", not a crash', async ({ page }) => {
    // PostgREST answers .single() with 406 when no row matches.
    await page.route('**/rest/v1/series*', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 406,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'JSON object requested, multiple (or no) rows returned' })
        });
      } else {
        route.fallback();
      }
    });

    const response = await page.goto('/library/series/does-not-exist');

    expect(response.status()).toBe(200);          // still a rendered page, not a 500
    await expect(shell(page).getByText('Series not found')).toBeVisible();
  });
});

/*
 * In-story navigation — Task 8 of the series-page plan.
 *
 * The plan's own draft for this task was unusable as written: every assertion
 * was wrapped in `if (await x.isVisible())`, so a locator that never appears
 * makes the test pass having checked nothing. It also assumed "expand series"
 * always needs a click to reveal the sidebar.
 *
 * Reading SeriesSidebar.jsx directly instead shows why: on desktop
 * (`isMobile={false}`), the component ignores its `isOpen` prop entirely and
 * always renders — "expand series" only does anything below the 1024px
 * breakpoint in ReadStory.jsx. That split is exactly what these tests assert,
 * rather than guessing around it with conditionals.
 *
 * Locators are scoped to `h1.title` / `aside` rather than bare `h1`/`h2`, for
 * the same Astro-dev-toolbar shadow-DOM reason documented in the Series Hub
 * tests above — this page has no `.series-shell`-style wrapper to scope to,
 * so specific tags/classes stand in for it.
 */
test.describe('In-Story Series Navigation', () => {
  const PARTS = MOCK_SERIES_PARTS;
  const [PART_1, PART_2, PART_3] = PARTS;

  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await setupSeriesReaderMocks(page);   // supersedes setupSeriesPartsMock — see mocks.js
  });

  test.describe('desktop', () => {
    // Desktop Chrome project default viewport is already >1024px; no override needed.

    test('shows the context bar with the correct part number and title', async ({ page }) => {
      await page.goto(`/library/read/${PART_2.book_id}`);

      await expect(page.getByText(`Part 2 of ${PARTS.length}: ${PART_2.books.title}`)).toBeVisible();
    });

    test('sidebar is visible immediately, with no need to expand it', async ({ page }) => {
      await page.goto(`/library/read/${PART_2.book_id}`);

      // No click on "expand series" — desktop ignores that toggle entirely.
      await expect(page.locator('aside').getByText(PART_1.books.title)).toBeVisible();
      await expect(page.locator('aside').getByText(PART_2.books.title)).toBeVisible();
      await expect(page.locator('aside').getByText(PART_3.books.title)).toBeVisible();
    });

    test('marks the current part, earlier parts as completed, later parts as unread', async ({ page }) => {
      await page.goto(`/library/read/${PART_2.book_id}`);

      const sidebar = page.locator('aside');
      await expect(sidebar.getByText('(You are here)')).toBeVisible();
      await expect(sidebar.getByText('(Completed)')).toBeVisible();
      await expect(sidebar.getByText('(Not yet read)')).toBeVisible();
    });

    test('first part has no Prev link', async ({ page }) => {
      await page.goto(`/library/read/${PART_1.book_id}`);

      await expect(page.locator('aside').getByRole('link', { name: /Prev/ })).toHaveCount(0);
      await expect(page.locator('aside').getByRole('link', { name: /Next/ })).toBeVisible();
    });

    test('last part has no Next link', async ({ page }) => {
      await page.goto(`/library/read/${PART_3.book_id}`);

      await expect(page.locator('aside').getByRole('link', { name: /Next/ })).toHaveCount(0);
      await expect(page.locator('aside').getByRole('link', { name: /Prev/ })).toBeVisible();
    });

    test('Prev navigates to the previous part', async ({ page }) => {
      await page.goto(`/library/read/${PART_2.book_id}`);

      await page.locator('aside').getByRole('link', { name: /Prev/ }).click();
      await page.waitForURL(`**/library/read/${PART_1.book_id}`);

      await expect(page.getByText(`Part 1 of ${PARTS.length}: ${PART_1.books.title}`)).toBeVisible();
    });

    test('Next navigates to the following part', async ({ page }) => {
      await page.goto(`/library/read/${PART_1.book_id}`);

      await page.locator('aside').getByRole('link', { name: /Next/ }).click();
      await page.waitForURL(`**/library/read/${PART_2.book_id}`);

      await expect(page.getByText(`Part 2 of ${PARTS.length}: ${PART_2.books.title}`)).toBeVisible();
    });

    test('clicking the series title in the context bar returns to the hub', async ({ page }) => {
      await page.goto(`/library/read/${PART_2.book_id}`);

      await page.getByRole('link', { name: new RegExp(PART_2.series.title) }).click();
      await page.waitForURL(`**/library/series/${PART_2.series_id}`);
    });
  });

  test.describe('mobile', () => {
    test.use({ viewport: { width: 500, height: 900 } });   // below ReadStory's 1024px breakpoint

    test('sidebar starts closed and opens via "expand series"', async ({ page }) => {
      await page.goto(`/library/read/${PART_2.book_id}`);

      await expect(page.getByText(PART_1.books.title)).toHaveCount(0);

      await page.getByRole('button', { name: /expand series/i }).click();

      await expect(page.getByText(PART_1.books.title)).toBeVisible();
      await expect(page.getByText('(You are here)')).toBeVisible();
    });

    test('closes via the × button', async ({ page }) => {
      await page.goto(`/library/read/${PART_2.book_id}`);
      await page.getByRole('button', { name: /expand series/i }).click();
      await expect(page.getByText('(You are here)')).toBeVisible();

      await page.getByRole('button', { name: '✕' }).click();

      await expect(page.getByText('(You are here)')).toHaveCount(0);
    });

    test('closes on Escape', async ({ page }) => {
      await page.goto(`/library/read/${PART_2.book_id}`);
      await page.getByRole('button', { name: /expand series/i }).click();
      await expect(page.getByText('(You are here)')).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(page.getByText('(You are here)')).toHaveCount(0);
    });
  });
});
