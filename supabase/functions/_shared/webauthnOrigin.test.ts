import { test, expect } from 'vitest'
import { webauthnConfig, DEFAULT_RP_ID, PROD_ORIGINS } from './webauthnOrigin'

test('defaults to horrorwriter.org and the two production origins only', () => {
  const { rpID, origins } = webauthnConfig()
  expect(rpID).toBe(DEFAULT_RP_ID)
  expect(origins).toEqual(PROD_ORIGINS)
  expect(origins.some((o) => /pages\.dev|localhost|127\.0\.0\.1/.test(o))).toBe(false)
})

test('extra origins must be exact origins', () => {
  const { origins } = webauthnConfig({
    extraOrigins: 'http://localhost:5173, https://*.evil.dev, https://x.test/path, not a url, https://horrorwriter.org',
  })
  expect(origins).toEqual([...PROD_ORIGINS, 'http://localhost:5173'])
})

test('rp id can be overridden for local dev', () => {
  expect(webauthnConfig({ rpId: 'localhost' }).rpID).toBe('localhost')
  expect(webauthnConfig({ rpId: '  ' }).rpID).toBe(DEFAULT_RP_ID)
})
