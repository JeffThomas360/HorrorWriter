import { describe, it, expect } from 'vitest'
import { buildMemberEmail } from './memberEmail'

const TOKEN = '0a1b2c3d-0000-4000-8000-00000000abcd'
const row = (over = {}) => ({
  title: 'New critique on "The Bell Tower"',
  href: '/library/read/00000000-0000-4000-8000-0000000d9001/',
  off_token: TOKEN,
  ...over,
})

describe('buildMemberEmail', () => {
  it('builds the subject, the read link and the turn-off link', () => {
    const mail = buildMemberEmail(row())
    expect(mail?.subject).toBe('New critique on "The Bell Tower"')
    expect(mail?.offUrl).toBe(`https://horrorwriter.org/email-off/?t=${TOKEN}`)
    expect(mail?.text).toContain('Read it: https://horrorwriter.org/library/read/00000000-0000-4000-8000-0000000d9001/')
    expect(mail?.text).toContain(`Turn these emails off: https://horrorwriter.org/email-off/?t=${TOKEN}`)
    expect(mail?.html).toContain('href="https://horrorwriter.org/library/read/00000000-0000-4000-8000-0000000d9001/"')
    expect(mail?.html).toContain(`href="https://horrorwriter.org/email-off/?t=${TOKEN}"`)
  })

  it('accepts a thread link with a post anchor', () => {
    expect(buildMemberEmail(row({ href: '/forum/thread/abc/#post-123' }))).not.toBeNull()
  })

  it('escapes a title a member wrote', () => {
    const mail = buildMemberEmail(row({ title: 'New critique on "<script>alert(1)</script>"' }))
    expect(mail?.html).not.toContain('<script>')
    expect(mail?.html).toContain('&lt;script&gt;')
  })

  it('keeps the subject to one line', () => {
    const mail = buildMemberEmail(row({ title: 'New critique\r\nBcc: someone@example.test' }))
    expect(mail?.subject).toBe('New critique Bcc: someone@example.test')
    expect(mail?.subject).not.toMatch(/[\r\n]/)
  })

  it('refuses a link that leaves this site', () => {
    for (const href of ['https://evil.example/', '//evil.example/', 'library/read/x/', '/x?next=//evil.example', '', null]) {
      expect(buildMemberEmail(row({ href }))).toBeNull()
    }
  })

  it('never builds an email with no way to turn it off', () => {
    for (const off_token of [undefined, '', 'not-a-uuid', 42]) {
      expect(buildMemberEmail(row({ off_token }))).toBeNull()
    }
  })

  it('refuses a row with no title', () => {
    expect(buildMemberEmail(row({ title: '   ' }))).toBeNull()
    expect(buildMemberEmail({})).toBeNull()
  })
})
