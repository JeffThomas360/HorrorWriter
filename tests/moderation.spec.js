import { test, expect } from '@playwright/test'
import { setupSupabaseMocks, setupMockAuth, MOCK_SESSION } from './mocks'

test.describe('Moderation — public badges', () => {
  test('a moderator profile shows their role badge', async ({ page }) => {
    await setupSupabaseMocks(page)
    // profiles GET by handle returns a warden (see mocks.js handle branch)
    await page.goto('/u/warden_wendy')
    await expect(page.locator('.mod-badge', { hasText: 'Warden' })).toBeVisible()
  })
})

test.describe('Moderation — terminal gate', () => {
  test('non-mod sees a disguised 404, no tabs', async ({ page }) => {
    await setupSupabaseMocks(page)            // MOCK_PROFILE has mod_role: null
    await setupMockAuth(page)
    await page.goto('/moderation')
    await expect(page.getByText(/404 — page not found/i)).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Registry' })).toHaveCount(0)
  })

  test('keeper sees the terminal with Registry + Badges tabs', async ({ page }) => {
    await setupSupabaseMocks(page, { mod_role: 'keeper' })  // see mocks change below
    await setupMockAuth(page)
    await page.goto('/moderation')
    await expect(page.getByRole('tab', { name: 'Registry' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Badges' })).toBeVisible()
  })
})

test.describe('Moderation — registry', () => {
  test('keeper searches and assigns a role (calls set_mod_role)', async ({ page }) => {
    await setupSupabaseMocks(page, { mod_role: 'keeper' })
    await setupMockAuth(page)
    let rpcBody = null
    await page.route('**/rest/v1/rpc/set_mod_role*', async (route) => {
      rpcBody = JSON.parse(route.request().postData() || '{}')
      route.fulfill({ status: 204, contentType: 'application/json', body: '' })
    })
    await page.goto('/moderation')
    await page.getByLabel('Search users').fill('spooky')
    await page.getByRole('button', { name: /Search/i }).click()
    await expect(page.getByText('@spooky_newbie')).toBeVisible()
    await page.getByLabel(/Role for spooky_newbie/i).selectOption('moderator')
    await page.getByLabel(/Scope for spooky_newbie/i).selectOption('forum')
    await page.locator('.mod-user-row', { hasText: 'spooky_newbie' }).getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => rpcBody?.p_role).toBe('moderator')
    expect(rpcBody.p_scope).toBe('forum')
  })
})
