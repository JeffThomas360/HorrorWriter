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

  const btnClass =
    'inline-flex items-center gap-1.5 border border-[var(--color-line)] px-3 py-1.5 text-[13px] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent-crimson)] hover:text-[var(--color-accent-crimson)] cursor-pointer'

  return (
    <div className="mt-8 flex items-center gap-3 border border-[var(--color-line)] bg-[#ffffff]/[0.03] p-4">
      <span className="text-[13px] uppercase tracking-wide text-[var(--color-text-secondary)]">
        Spread the fear
      </span>

      <div className="ml-auto flex gap-2">
        <a href={tweetUrl} target="_blank" rel="noopener noreferrer" className={btnClass}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.005 4.15H5.059z" />
          </svg>
          Share
        </a>

        <button onClick={copyLink} className={btnClass}>
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
