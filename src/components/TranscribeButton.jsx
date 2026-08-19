import { useState } from 'react'
import TranscribeModal from './TranscribeModal'

export default function TranscribeButton({ onTranscribed }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="transcribe-btn inline-flex items-center gap-2 border border-[var(--color-line)] px-4 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent-crimson)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
      >
        <svg
          viewBox="0 0 24 24" width="15" height="15"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
        Dictate
      </button>
      {open && (
        <TranscribeModal
          onTranscribed={(text) => { onTranscribed(text); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
