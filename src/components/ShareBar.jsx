import { useEffect, useState } from 'react'
import { shareTargets } from '../lib/share'
import { absoluteUrl } from '../lib/urls'

/**
 * Share row for a story or a prompt thread.
 * `path` is the page's own path (e.g. storyPath(id)); the shared link is always
 * the horrorwriter.org address, never a preview or localhost one.
 */
export default function ShareBar({ path, title = 'Horror Writer' }) {
  const [copied, setCopied] = useState(false)
  // The phone/desktop share sheet. Only known in the browser, so it starts off
  // and the plain links below are what the server renders.
  const [canShare, setCanShare] = useState(false)
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const shareUrl = absoluteUrl(path)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy', e)
    }
  }

  const openShareSheet = async () => {
    try {
      await navigator.share({ title, url: shareUrl })
    } catch (e) {
      // Closing the sheet without sharing is not an error.
      if (e?.name !== 'AbortError') console.error('Failed to share', e)
    }
  }

  const btnClass =
    'inline-flex items-center gap-1.5 border border-[var(--color-line)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent-crimson)] hover:text-[var(--color-accent-crimson)] cursor-pointer'

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border border-[var(--color-line)] bg-[#ffffff]/[0.03] p-4">
      <span className="text-[13px] uppercase tracking-wide text-[var(--color-text-secondary)]">
        Spread the fear
      </span>

      <div className="ml-auto flex flex-wrap gap-2">
        {canShare && (
          <button type="button" onClick={openShareSheet} className={btnClass}>
            Share
          </button>
        )}
        {shareTargets({ url: shareUrl, title }).map((t) => (
          <a key={t.id} href={t.href} target="_blank" rel="noopener noreferrer" className={btnClass}>
            {t.label}
          </a>
        ))}
        <button type="button" onClick={copyLink} className={btnClass}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          {copied ? 'Copied!' : 'Link'}
        </button>
      </div>
    </div>
  )
}
