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
