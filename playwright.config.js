// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Astro's dev server compiles routes + React islands JIT on first request.
     Under parallel workers the first cold hit to a route can exceed the default
     5s expect timeout, so give assertions more headroom. */
  expect: { timeout: 15000 },
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace and video for failures. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Auto-grant the mic and feed a synthetic audio stream so the
          // MediaRecorder record path runs headlessly without a real device.
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
    // For now, we'll just test in Chromium to save time/resources locally.
    // Uncomment these if you want cross-browser testing later:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      VITE_TRANSCRIBE_URL: 'http://localhost:5173',
      PLAYWRIGHT_TEST: 'true',
      // Astro 7 auto-backgrounds `astro dev` when it detects an AI-agent terminal,
      // which detaches the process and breaks Playwright's webServer readiness wait.
      // Force foreground so the webServer stays attached.
      ASTRO_DEV_BACKGROUND: '0',
    },
  },
});
