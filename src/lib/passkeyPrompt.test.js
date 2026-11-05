import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  PASSKEY_PROMPT_KEY,
  EMAIL_LINK_KEY,
  setPasskeyPrompt,
  passkeyPromptFor,
  clearPasskeyPrompt,
  markEmailLinkRequested,
  takeEmailLinkRequest,
} from './passkeyPrompt.js'

const HOUR = 60 * 60 * 1000

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('keys', () => {
  it('are the two names the rest of the site and its tests rely on', () => {
    expect(PASSKEY_PROMPT_KEY).toBe('hw:passkeyPrompt')
    expect(EMAIL_LINK_KEY).toBe('hw:emailLinkRequestedAt')
  })
})

// R26: the prompt flag remembers which account it was left for, so it is only ever shown
// to that member, never to whoever signs in next on the same browser.
describe('setPasskeyPrompt / passkeyPromptFor / clearPasskeyPrompt', () => {
  it('stores the user id the prompt was left for, and reads it back', () => {
    setPasskeyPrompt('u1')
    expect(localStorage.getItem(PASSKEY_PROMPT_KEY)).toBe('u1')
    expect(passkeyPromptFor()).toBe('u1')
  })

  it('stores nothing without a user id', () => {
    for (const id of [undefined, null, '']) {
      setPasskeyPrompt(id)
      expect(localStorage.getItem(PASSKEY_PROMPT_KEY)).toBeNull()
    }
  })

  it('is null when there is no flag', () => {
    expect(passkeyPromptFor()).toBeNull()
  })

  it('clearing removes it', () => {
    setPasskeyPrompt('u1')
    clearPasskeyPrompt()
    expect(passkeyPromptFor()).toBeNull()
  })

  it('blocked storage reads as no flag and never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(() => setPasskeyPrompt('u1')).not.toThrow()
    expect(passkeyPromptFor()).toBeNull()
    expect(() => clearPasskeyPrompt()).not.toThrow()
  })
})

// The marker says "this browser asked for an email link a moment ago". It is what keeps a
// link someone else crafted from putting the add-a-passkey prompt in front of this member.
describe('markEmailLinkRequested / takeEmailLinkRequest', () => {
  it('writes the time as a string, and a fresh marker is accepted', () => {
    markEmailLinkRequested(1_000_000)
    expect(localStorage.getItem(EMAIL_LINK_KEY)).toBe('1000000')
    expect(takeEmailLinkRequest(1_000_000 + 5 * 60 * 1000)).toBe(true)
  })

  it('stamps the current time by default', () => {
    const before = Date.now()
    markEmailLinkRequested()
    const at = Number(localStorage.getItem(EMAIL_LINK_KEY))
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(Date.now())
  })

  it('is read once: taking it clears it, accepted or not', () => {
    markEmailLinkRequested(0)
    expect(takeEmailLinkRequest(1000)).toBe(true)
    expect(localStorage.getItem(EMAIL_LINK_KEY)).toBeNull()
    expect(takeEmailLinkRequest(1000)).toBe(false)

    markEmailLinkRequested(0)
    expect(takeEmailLinkRequest(2 * HOUR)).toBe(false)
    expect(localStorage.getItem(EMAIL_LINK_KEY)).toBeNull()
  })

  it('is refused with no marker at all', () => {
    expect(takeEmailLinkRequest()).toBe(false)
  })

  it('is accepted just under an hour old and refused at an hour', () => {
    markEmailLinkRequested(0)
    expect(takeEmailLinkRequest(HOUR - 1)).toBe(true)
    markEmailLinkRequested(0)
    expect(takeEmailLinkRequest(HOUR)).toBe(false)
  })

  it('is refused when it is older than an hour', () => {
    markEmailLinkRequested(0)
    expect(takeEmailLinkRequest(HOUR + 1)).toBe(false)
  })

  it('is refused when it claims to be from the future', () => {
    markEmailLinkRequested(10_000)
    expect(takeEmailLinkRequest(5_000)).toBe(false)
  })

  it('is refused when it is not a time', () => {
    for (const junk of ['', 'abc', 'NaN', 'Infinity', '{}']) {
      localStorage.setItem(EMAIL_LINK_KEY, junk)
      expect(takeEmailLinkRequest(Date.now())).toBe(false)
      expect(localStorage.getItem(EMAIL_LINK_KEY)).toBeNull()
    }
  })

  it('blocked storage means refused, never a crash', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(takeEmailLinkRequest()).toBe(false)
  })

  it('a failed clear does not change the answer', () => {
    markEmailLinkRequested(0)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(takeEmailLinkRequest(1000)).toBe(true)
  })

  it('blocked storage while writing is swallowed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(() => markEmailLinkRequested()).not.toThrow()
  })
})
