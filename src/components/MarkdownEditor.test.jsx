import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import MarkdownEditor from './MarkdownEditor'

describe('MarkdownEditor Component', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders default write view with RTF toolbar buttons', () => {
    const handleChange = vi.fn()
    render(<MarkdownEditor value="Initial dread" onChange={handleChange} />)

    // Check RTF buttons
    expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /underline/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /strikethrough/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /highlight/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /heading 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scene break/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dialogue em-dash/i })).toBeInTheDocument()

    // Check mode buttons
    expect(screen.getByRole('button', { name: 'Write' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Split View' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()

    // Textarea should be visible in write mode
    expect(screen.getByDisplayValue('Initial dread')).toBeInTheDocument()
  })

  it('switches to preview mode and renders RTF HTML correctly', () => {
    const formattedMarkdown = '# The Whispering Well\n\nVincent noticed the **heavy fog**.\n\n<u>Do not look down</u>.\n\n<mark>Forbidden</mark>'
    render(<MarkdownEditor value={formattedMarkdown} onChange={() => {}} />)

    // Click Preview
    const previewTab = screen.getByRole('button', { name: 'Preview' })
    fireEvent.click(previewTab)

    // Textarea is no longer visible in preview mode
    expect(screen.queryByDisplayValue(formattedMarkdown)).not.toBeInTheDocument()

    // Heading rendered
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Whispering Well')

    // Bold text rendered
    expect(screen.getByText('heavy fog')).toBeInTheDocument()

    // Underline tag rendered via rehypeRaw
    const uEl = document.querySelector('u')
    expect(uEl).not.toBeNull()
    expect(uEl.textContent).toBe('Do not look down')

    // Highlight tag rendered via rehypeRaw
    const markEl = document.querySelector('mark')
    expect(markEl).not.toBeNull()
    expect(markEl.textContent).toBe('Forbidden')
  })

  it('switches to split view mode showing both editor and live preview', () => {
    const content = '— *“Who goes there?”* asked Elisa.'
    render(<MarkdownEditor value={content} onChange={() => {}} />)

    // Click Split View
    const splitTab = screen.getByRole('button', { name: 'Split View' })
    fireEvent.click(splitTab)

    // Both textarea and preview element are present
    expect(screen.getByDisplayValue(content)).toBeInTheDocument()
    const previewContainer = document.querySelector('.md-preview')
    expect(previewContainer).not.toBeNull()
    expect(previewContainer.textContent).toContain('“Who goes there?” asked Elisa.')
  })
})
