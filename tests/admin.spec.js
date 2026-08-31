import { test, expect } from '@playwright/test'

/**
 * Admin panel E2E.
 *
 * Written alongside the panel rather than retrofitted — tests/moderation.spec.js
 * had its selectors locked in after the fact, which constrained the Terminal
 * rebuild later. The selectors asserted here are the intended stable contract:
 * tab roles/labels, the directory search box, and `.admin-user-row`. Treat them
 * as API when changing these components.
 *
 * Auth setup mirrors whatever tests/moderation.spec.js does; these tests assume
 * the same signed-in-as-Keeper storage state.
 */

test.describe('Admin panel', () => {
  test('is a 404 for a visitor with no mod role', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByText('404 — page not found')).toBeVisible()
  })

  test.describe('as Keeper', () => {
    test.use({ storageState: 'tests/.auth/keeper.json' })

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
