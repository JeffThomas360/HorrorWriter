/**
 * True only under Playwright's dev server, where pages skip their server-side
 * database lookups so the browser-side mocks are the only data source.
 *
 * The flag is baked in by astro.config (`vite.define`) from PLAYWRIGHT_TEST,
 * not read from process.env here: the Cloudflare adapter renders pages inside
 * workerd, where the host shell's environment is not visible, so an env check
 * in a page is always false and its lookups hit the live database. Production
 * builds compile this to `false`.
 */
export function isPlaywrightTest() {
  return typeof __PLAYWRIGHT_TEST__ !== 'undefined' && __PLAYWRIGHT_TEST__ === true
}
