import { useState } from 'react'
import TranscribeModal from './TranscribeModal'

export default function TranscribeButton({ onTranscribed }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="btn ghost transcribe-btn"
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px' }}
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
        Transcribe Audio
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
