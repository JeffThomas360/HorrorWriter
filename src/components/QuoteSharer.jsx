import { useState, useEffect } from 'react'

export default function QuoteSharer({ title, url }) {
  const [selection, setSelection] = useState({ text: '', x: 0, y: 0 })

  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection()
      const text = sel.toString().trim()
      
      if (text && text.length > 5) {
        // Find position to show the tooltip
        const range = sel.getRangeAt(0).getBoundingClientRect()
        setSelection({
          text,
          x: range.left + range.width / 2,
          y: range.top + window.scrollY - 40 // above the selection
        })
      } else {
        setSelection({ text: '', x: 0, y: 0 })
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    // Clear selection on mousedown unless clicking the tooltip itself
    const handleMouseDown = (e) => {
      if (!e.target.closest('#quote-sharer')) {
        setSelection({ text: '', x: 0, y: 0 })
      }
    }
    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [])

  if (!selection.text) return null

  const shareUrl = url || window.location.href
  const shareText = `"${selection.text}"\n\n— ${title}`
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`

  return (
    <div 
      id="quote-sharer"
      style={{
        position: 'absolute',
        left: selection.x,
        top: selection.y,
        transform: 'translateX(-50%)',
        zIndex: 100,
        background: 'var(--blood)',
        color: 'var(--paper)',
        padding: '6px 12px',
        borderRadius: 'var(--r-button)',
        fontSize: '12px',
        fontWeight: 'bold',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        cursor: 'pointer'
      }}
      onClick={() => window.open(tweetUrl, '_blank')}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.005 4.15H5.059z" />
      </svg>
      Quote
      
      {/* Down arrow pointing to text */}
      <div style={{
        position: 'absolute',
        bottom: '-6px',
        left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: '6px solid var(--blood)'
      }} />
    </div>
  )
}
