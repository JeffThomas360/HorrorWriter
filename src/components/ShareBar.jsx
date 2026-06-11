import { useState } from 'react'

export default function ShareBar({ title, text, url }) {
  const [copied, setCopied] = useState(false)

  const shareUrl = url || window.location.href
  const shareText = text ? `"${text}"\n\n— ${title}` : `Read "${title}" on Horror Writer.`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy', e)
    }
  }

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`

  return (
    <div className="share-bar" style={{
      display: 'flex', gap: '12px', alignItems: 'center',
      padding: '16px', background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--line)', borderRadius: 'var(--r-block)',
      marginTop: '32px'
    }}>
      <span style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Spread the fear
      </span>
      
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
        <a 
          href={tweetUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="btn ghost" 
          style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.005 4.15H5.059z" />
          </svg>
          Share
        </a>

        <button 
          onClick={copyLink} 
          className="btn ghost"
          style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          {copied ? 'Copied!' : 'Link'}
        </button>
      </div>
    </div>
  )
}
