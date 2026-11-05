import { describe, it, expect } from 'vitest'
import { buildKeeperAlert } from './keeperAlert'

describe('buildKeeperAlert', () => {
  it('builds a new-ticket alert from the topic label and handle', () => {
    expect(buildKeeperAlert({ kind: 'ticket_new', topic: 'signing-in', handle: 'ash-1a2b' })).toEqual({
      title: 'New ticket',
      message: 'Signing in — @ash-1a2b',
      url: 'https://horrorwriter.org/admin/?tab=queue',
      url_title: 'Open the queue',
    })
  })
  it('uses the right label for every topic slug', () => {
    const labels: Record<string, string> = {
      'signing-in': 'Signing in',
      'my-writing': 'My writing',
      rituals: 'Rituals',
      'another-member': 'Another member',
      broken: "Something's broken",
      other: 'Other',
    }
    for (const [slug, label] of Object.entries(labels)) {
      expect(buildKeeperAlert({ kind: 'ticket_new', topic: slug, handle: 'ash-1a2b' })?.message).toBe(`${label} — @ash-1a2b`)
    }
  })
  it('builds a reply alert', () => {
    const out = buildKeeperAlert({ kind: 'ticket_reply', handle: 'ash-1a2b' })
    expect(out?.title).toBe('Reply on ticket')
    expect(out?.message).toBe('@ash-1a2b replied')
    expect(out?.url).toBe('https://horrorwriter.org/admin/?tab=queue')
  })
  it('builds a signup alert that links to the user list', () => {
    const out = buildKeeperAlert({ kind: 'signup', handle: 'ash-1a2b' })
    expect(out?.title).toBe('New member')
    expect(out?.message).toBe('@ash-1a2b joined')
    expect(out?.url).toBe('https://horrorwriter.org/admin/?tab=users')
  })
  it('builds a surge alert from the count', () => {
    const out = buildKeeperAlert({ kind: 'signup_surge', count: 11 })
    expect(out?.title).toBe('Signup surge')
    expect(out?.message).toBe('11 new accounts in the last hour')
    expect(out?.url).toBe('https://horrorwriter.org/admin/?tab=users')
  })

  it('leaves the handle out when there is none', () => {
    expect(buildKeeperAlert({ kind: 'signup' })?.message).toBe('A new member joined')
    expect(buildKeeperAlert({ kind: 'ticket_reply' })?.message).toBe('A member replied')
    expect(buildKeeperAlert({ kind: 'ticket_new', topic: 'signing-in' })?.message).toBe('Signing in — a member')
  })
  it('treats an invalid handle as absent rather than rejecting the alert', () => {
    const bad = ['<b>x</b>', 'Ash', 'a b', '', 'x'.repeat(41), '@ash', 'ash\n1']
    for (const handle of bad) {
      expect(buildKeeperAlert({ kind: 'signup', handle })?.message).toBe('A new member joined')
      expect(buildKeeperAlert({ kind: 'ticket_reply', handle })?.message).toBe('A member replied')
      expect(buildKeeperAlert({ kind: 'ticket_new', topic: 'other', handle })?.message).toBe('Other — a member')
    }
    expect(buildKeeperAlert({ kind: 'signup', handle: '<b>x</b>' })?.message).not.toContain('<')
  })
  it('accepts a handle at the 40-character limit', () => {
    const handle = 'a'.repeat(40)
    expect(buildKeeperAlert({ kind: 'signup', handle })?.message).toBe(`@${handle} joined`)
  })

  it('returns null for an unknown kind', () => {
    expect(buildKeeperAlert({ kind: 'x' })).toBeNull()
    expect(buildKeeperAlert({})).toBeNull()
    expect(buildKeeperAlert(null)).toBeNull()
  })
  it('returns null for a ticket_new with an unknown or missing topic', () => {
    expect(buildKeeperAlert({ kind: 'ticket_new', topic: 'nope', handle: 'ash-1a2b' })).toBeNull()
    expect(buildKeeperAlert({ kind: 'ticket_new', handle: 'ash-1a2b' })).toBeNull()
  })
  it('rejects an unknown topic on any kind, and ignores a valid one where it is not used', () => {
    expect(buildKeeperAlert({ kind: 'ticket_reply', topic: 'nope', handle: 'ash-1a2b' })).toBeNull()
    expect(buildKeeperAlert({ kind: 'signup', topic: 'nope' })).toBeNull()
    expect(buildKeeperAlert({ kind: 'ticket_reply', topic: 'broken', handle: 'ash-1a2b' })?.message).toBe('@ash-1a2b replied')
  })
  it('does not treat inherited object keys as topics', () => {
    expect(buildKeeperAlert({ kind: 'ticket_new', topic: 'constructor', handle: 'ash-1a2b' })).toBeNull()
    expect(buildKeeperAlert({ kind: 'ticket_new', topic: '__proto__', handle: 'ash-1a2b' })).toBeNull()
  })
  it('returns null for a surge without a usable count', () => {
    expect(buildKeeperAlert({ kind: 'signup_surge' })).toBeNull()
    expect(buildKeeperAlert({ kind: 'signup_surge', count: 'many' as unknown as number })).toBeNull()
    expect(buildKeeperAlert({ kind: 'signup_surge', count: -3 })).toBeNull()
  })
})
