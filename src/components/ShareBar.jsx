import { useState } from 'react'

export default function ShareBar({ url }) {
  const [copied, setCopied] = useState(false)

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '') // safe during server render

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy', e)
    }
  }

  const btnClass =
    'inline-flex items-center gap-1.5 border border-[var(--color-line)] px-3 py-1.5 text-[13px] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent-crimson)] hover:text-[var(--color-accent-crimson)] cursor-pointer'

  return (
    <div className="mt-8 flex items-center gap-3 border border-[var(--color-line)] bg-[#ffffff]/[0.03] p-4">
      <span className="text-[13px] uppercase tracking-wide text-[var(--color-text-secondary)]">
        Spread the fear
      </span>

      <div className="ml-auto flex gap-2">
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
