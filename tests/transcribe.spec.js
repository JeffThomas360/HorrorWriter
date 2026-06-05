import { test, expect } from '@playwright/test'
import { setupSupabaseMocks, setupMockAuth } from './mocks'

test.describe('Audio Transcription', () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page)
    await setupMockAuth(page)

    await page.route('**/transcribe', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Darkness fell upon the ancient house.' }),
      })
    })
  })

  test('Transcribe Audio button appears on story editor', async ({ page }) => {
    await page.goto('/library/publish')
    await expect(page.getByRole('button', { name: /Transcribe Audio/i })).toBeVisible()
  })

  test('Transcribe Audio button appears on create thread form', async ({ page }) => {
    await page.goto('/forum/new')
    await expect(page.getByRole('button', { name: /Transcribe Audio/i })).toBeVisible()
  })

  test('Modal opens with warning banner', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /Transcribe Audio/i }).click()
    await expect(page.locator('.modal-content')).toBeVisible()
    await expect(page.locator('.modal-content')).toContainText('For best results')
  })

  test('File over 4 MB shows size error and disables Transcribe button', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /Transcribe Audio/i }).click()

    await page.locator('input[type="file"]').setInputFiles({
      name: 'big.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(5 * 1024 * 1024, 0),
    })

    await expect(page.locator('.modal-content')).toContainText('File exceeds the 4 MB limit.')
    await expect(page.getByRole('button', { name: /^Transcribe$/ })).toBeDisabled()
  })

  test('Successful upload transcription injects text into story content textarea', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /Transcribe Audio/i }).click()

    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(1024, 0),
    })

    await page.getByRole('button', { name: /^Transcribe$/ }).click()

    await expect(page.locator('.modal-content')).not.toBeVisible()
    await expect(
      page.locator('textarea[placeholder*="nervous"]')
    ).toHaveValue('Darkness fell upon the ancient house.')
  })

  test('Successful upload transcription injects text into thread body textarea', async ({ page }) => {
    await page.goto('/forum/new')
    await page.getByRole('button', { name: /Transcribe Audio/i }).click()

    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(1024, 0),
    })

    await page.getByRole('button', { name: /^Transcribe$/ }).click()

    await expect(page.locator('.modal-content')).not.toBeVisible()
    await expect(
      page.locator('textarea[placeholder*="void"]')
    ).toHaveValue('Darkness fell upon the ancient house.')
  })
})
