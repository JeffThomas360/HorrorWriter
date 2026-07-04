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

  test('Dictate button appears on story editor', async ({ page }) => {
    await page.goto('/library/publish')
    await expect(page.getByRole('button', { name: /^Dictate$/ })).toBeVisible({ timeout: 15000 })
  })

  test('Dictate button appears on create thread form', async ({ page }) => {
    await page.goto('/forum/new')
    await expect(page.getByRole('button', { name: /^Dictate$/ })).toBeVisible({ timeout: 15000 })
  })

  test('Modal opens on the record step with the stepper and helper', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /^Dictate$/ }).click()
    const dialog = page.getByRole('dialog', { name: /Dictate a post/i })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Speak clearly in a quiet room')
    await expect(dialog.getByRole('button', { name: /Tap to record/i })).toBeVisible()
    await expect(dialog.getByText(/upload an audio file instead/i)).toBeVisible()
  })

  test('Record path: record, review the transcript, add to the story', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /^Dictate$/ }).click()
    const dialog = page.getByRole('dialog', { name: /Dictate a post/i })

    await dialog.getByRole('button', { name: /Tap to record/i }).click()
    await expect(dialog.getByText(/listening/i)).toBeVisible()
    await page.waitForTimeout(1500)
    await dialog.getByRole('button', { name: /Stop & review/i }).click()

    const review = dialog.getByRole('textbox', { name: /Transcript/i })
    await expect(review).toHaveValue('Darkness fell upon the ancient house.', { timeout: 15000 })

    await dialog.getByRole('button', { name: /Add to post/i }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText(/Added \d+ words to your draft/i)).toBeVisible()
    await expect(page.locator('textarea.md-textarea')).toHaveValue('Darkness fell upon the ancient house.')
  })

  test('Upload path: choose a file, review, add to the story', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /^Dictate$/ }).click()
    const dialog = page.getByRole('dialog', { name: /Dictate a post/i })

    await dialog.getByText(/upload an audio file instead/i).click()
    await dialog.locator('input[accept*="audio"]').setInputFiles({
      name: 'test.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(1024, 0),
    })

    const review = dialog.getByRole('textbox', { name: /Transcript/i })
    await expect(review).toHaveValue('Darkness fell upon the ancient house.', { timeout: 15000 })

    await dialog.getByRole('button', { name: /Add to post/i }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('textarea.md-textarea')).toHaveValue('Darkness fell upon the ancient house.')
  })

  test('Upload path injects text into the thread body', async ({ page }) => {
    await page.goto('/forum/new')
    await page.getByRole('button', { name: /^Dictate$/ }).click()
    const dialog = page.getByRole('dialog', { name: /Dictate a post/i })

    await dialog.getByText(/upload an audio file instead/i).click()
    await dialog.locator('input[accept*="audio"]').setInputFiles({
      name: 'test.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(1024, 0),
    })

    const review = dialog.getByRole('textbox', { name: /Transcript/i })
    await expect(review).toHaveValue('Darkness fell upon the ancient house.', { timeout: 15000 })

    await dialog.getByRole('button', { name: /Add to post/i }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('textarea.md-textarea')).toHaveValue('Darkness fell upon the ancient house.')
  })

  test('File over 4 MB shows size error and disables Transcribe button', async ({ page }) => {
    await page.goto('/library/publish')
    await page.locator('button.transcribe-btn').click()

    await page.locator('input[accept*="audio"]').setInputFiles({
      name: 'big.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(5 * 1024 * 1024, 0),
    })

    await expect(page.locator('.modal-content')).toContainText('File exceeds the 4 MB limit.')
    await expect(page.getByRole('button', { name: /^Transcribe$/ })).toBeDisabled()
  })
})
