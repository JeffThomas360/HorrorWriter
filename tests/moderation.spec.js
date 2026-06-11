import { test, expect } from '@playwright/test'
import { setupSupabaseMocks } from './mocks'

test.describe('Moderation — public badges', () => {
  test('a moderator profile shows their role badge', async ({ page }) => {
    await setupSupabaseMocks(page)
    // profiles GET by handle returns a warden (see mocks.js handle branch)
    await page.goto('/u/warden_wendy')
    await expect(page.locator('.mod-badge', { hasText: 'Warden' })).toBeVisible()
  })
})
