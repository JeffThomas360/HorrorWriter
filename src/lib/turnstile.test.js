import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const TEST_KEY = '1x00000000000000000000AA'
const scripts = () => document.querySelectorAll('script[src*="challenges.cloudflare.com"]')

// loadTurnstile memoises at module level, so each test gets a fresh copy of the module.
async function fresh() {
  vi.resetModules()
  return import('./turnstile.js')
}

beforeEach(() => {
  scripts().forEach((s) => s.remove())
  delete window.turnstile
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('turnstileSiteKey', () => {
  it('falls back to the always-pass test key when no key is configured', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    const { turnstileSiteKey } = await fresh()
    expect(turnstileSiteKey()).toBe(TEST_KEY)
  })

  it('uses the configured key', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0x4AAAAAAAreal')
    const { turnstileSiteKey } = await fresh()
    expect(turnstileSiteKey()).toBe('0x4AAAAAAAreal')
  })

  it('uses the test key under Playwright even when a real key is configured', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0x4AAAAAAAreal')
    vi.stubGlobal('__PLAYWRIGHT_TEST__', true)
    const { turnstileSiteKey } = await fresh()
    expect(turnstileSiteKey()).toBe(TEST_KEY)
  })
})

describe('loadTurnstile', () => {
  it('injects the explicit-render script once, however many times it is called', async () => {
    const { loadTurnstile } = await fresh()
    const first = loadTurnstile()
    const second = loadTurnstile()
    expect(scripts()).toHaveLength(1)
    expect(scripts()[0].getAttribute('src')).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
    expect(second).toBe(first)
    first.catch(() => {})
  })

  it('resolves with window.turnstile once the script has loaded', async () => {
    const { loadTurnstile } = await fresh()
    const pending = loadTurnstile()
    const api = { render: vi.fn() }
    window.turnstile = api
    scripts()[0].dispatchEvent(new Event('load'))
    await expect(pending).resolves.toBe(api)
  })

  it('resolves straight away when the script is already on the page', async () => {
    const { loadTurnstile } = await fresh()
    const api = { render: vi.fn() }
    window.turnstile = api
    await expect(loadTurnstile()).resolves.toBe(api)
    expect(scripts()).toHaveLength(0)
  })

  it('rejects when the script cannot load, and a later call tries again', async () => {
    const { loadTurnstile } = await fresh()
    const failed = loadTurnstile()
    scripts()[0].dispatchEvent(new Event('error'))
    await expect(failed).rejects.toThrow()
    expect(scripts()).toHaveLength(0)

    const retry = loadTurnstile()
    expect(scripts()).toHaveLength(1)
    const api = { render: vi.fn() }
    window.turnstile = api
    scripts()[0].dispatchEvent(new Event('load'))
    await expect(retry).resolves.toBe(api)
  })
})
