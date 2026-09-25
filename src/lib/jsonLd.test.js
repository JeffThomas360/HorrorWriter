import { describe, it, expect } from 'vitest'
import { serializeJsonLd } from './jsonLd'

// JSON-LD is written into a <script> tag with set:html, so user text (story and
// thread titles, display names) must not be able to close that tag.
describe('serializeJsonLd', () => {
  it('cannot be broken out of with </script>', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' })
    expect(out).not.toMatch(/<\/script/i)
    expect(out).not.toContain('<')
  })

  it('escapes HTML comment and CDATA openers', () => {
    const out = serializeJsonLd({ a: '<!--', b: ']]>' })
    expect(out).not.toContain('<!--')
    expect(out).not.toContain('>')
  })

  it('round-trips to the original data', () => {
    const data = { '@type': 'Article', headline: 'A <b>tale</b> & "more"', n: 3 }
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data)
  })

  it('escapes U+2028 and U+2029 line separators', () => {
    const LS = String.fromCharCode(0x2028)
    const PS = String.fromCharCode(0x2029)
    const out = serializeJsonLd({ s: `a${LS}b${PS}c` })
    expect(out).not.toContain(LS)
    expect(out).not.toContain(PS)
    expect(JSON.parse(out).s).toBe(`a${LS}b${PS}c`)
  })
})
