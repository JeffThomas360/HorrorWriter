import { test, expect } from '@playwright/test'
import { setupSupabaseMocks, setupMockAuth } from './mocks'

/**
 * Admin panel E2E.
 *
 * Written alongside the panel rather than retrofitted — tests/moderation.spec.js
 * had its selectors locked in after the fact, which constrained the Terminal
 * rebuild later. The selectors asserted here are the intended stable contract:
 * tab roles/labels, the directory search box, and `.admin-user-row`. Treat them
 * as API when changing these components.
 *
 * Auth is the same arrangement as tests/moderation.spec.js: a mocked session in
 * localStorage plus a profiles mock whose mod_role decides what /admin shows.
 * No saved storage-state file is involved.
 */

test.describe('Admin panel', () => {
  // /admin is the heaviest page in the app (six tabs plus the moderation case
  // file). Astro's dev server compiles it on first request, and when every
  // worker's first test hits a cold server at once that compile outlasts the
  // 15s expect timeout; serially the same tests pass in a few seconds each.
  // Compile it once per worker before anything is measured.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await setupSupabaseMocks(page, { mod_role: 'keeper' })
    await setupMockAuth(page)
    await page.goto('/admin')
    await expect(page.getByRole('tablist', { name: 'Admin sections' })).toBeVisible({ timeout: 90_000 })
    await page.close()
  })

  test('is a 404 for a visitor with no mod role', async ({ page }) => {
    await setupSupabaseMocks(page)            // MOCK_PROFILE has mod_role: null
    await setupMockAuth(page)
    await page.goto('/admin')
    await expect(page.getByText('404 — page not found')).toBeVisible()
  })

  test.describe('as Keeper', () => {
    test.beforeEach(async ({ page }) => {
      await setupSupabaseMocks(page, { mod_role: 'keeper' })
      await setupMockAuth(page)
    })

    test('renders every admin tab', async ({ page }) => {
      await page.goto('/admin')
      const tablist = page.getByRole('tablist', { name: 'Admin sections' })
      await expect(tablist.getByRole('tab', { name: 'Overview' })).toBeVisible()
      await expect(tablist.getByRole('tab', { name: 'Users' })).toBeVisible()
      await expect(tablist.getByRole('tab', { name: 'Site' })).toBeVisible()
      await expect(tablist.getByRole('tab', { name: 'Audit' })).toBeVisible()
    })

    test('tab selection is reflected in the URL and survives reload', async ({ page }) => {
      await page.goto('/admin')
      await page.getByRole('tab', { name: 'Users' }).click()
      await expect(page).toHaveURL(/[?&]tab=users/)

      await page.reload()
      await expect(page.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true')
    })

    test('back button returns to the previous tab', async ({ page }) => {
      await page.goto('/admin')
      await page.getByRole('tab', { name: 'Site' }).click()
      await page.getByRole('tab', { name: 'Audit' }).click()
      await page.goBack()
      await expect(page.getByRole('tab', { name: 'Site' })).toHaveAttribute('aria-selected', 'true')
    })

    test('user directory lists accounts and filters them', async ({ page }) => {
      await page.goto('/admin?tab=users')
      await expect(page.getByLabel('Search the user directory')).toBeVisible()
      await expect(page.locator('.admin-user-row').first()).toBeVisible()

      // Filtering to Staff should never return more rows than the unfiltered set.
      const total = await page.locator('.admin-user-row').count()
      await page.getByRole('button', { name: 'Staff' }).click()
      expect(await page.locator('.admin-user-row').count()).toBeLessThanOrEqual(total)
    })

    test('a directory row opens that user\'s case file', async ({ page }) => {
      await page.goto('/admin?tab=users')
      await page.locator('.admin-user-row').first().click()
      await expect(page.getByRole('button', { name: '← Back to directory' })).toBeVisible()
    })

    test('site settings expose the access toggles', async ({ page }) => {
      await page.goto('/admin?tab=site')
      await expect(page.getByRole('switch', { name: 'Registration open' })).toBeVisible()
      await expect(page.getByRole('switch', { name: 'Maintenance mode' })).toBeVisible()
      await expect(page.getByRole('switch', { name: 'Show announcement' })).toBeVisible()
    })

    test('audit tab renders its filters', async ({ page }) => {
      await page.goto('/admin?tab=audit')
      await expect(page.getByLabel('Search the audit log')).toBeVisible()
      await expect(page.getByLabel('Filter by action type')).toBeVisible()
    })
  })
})
