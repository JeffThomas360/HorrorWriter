import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'

const TRANSCRIBE_URL = import.meta.env.VITE_TRANSCRIBE_URL
const MAX_BYTES = 4 * 1024 * 1024
const ACCEPTED = '.mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/ogg'
const MAX_RECORD_MS = 10 * 60 * 1000
const HELPER = 'Speak clearly in a quiet room. Up to ~4 min.'
const STEPS = ['Record', 'Review', 'Add']

async function postAudio(blob, filename) {
  if (!TRANSCRIBE_URL) throw new Error('Transcription service is not configured.')
  const form = new FormData()
  form.append('audio', blob, filename)
  const res = await fetch(`${TRANSCRIBE_URL}/transcribe`, { method: 'POST', body: form })
  if (!res.ok) {
    let msg = 'Transcription failed.'
    try { const d = await res.json(); msg = d.error ?? msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  const data = await res.json()
  return data.text
}

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function wordCount(t) {
  return t.trim() ? t.trim().split(/\s+/).length : 0
}

export default function TranscribeModal({ onTranscribed, onClose }) {
  // step: 'record' | 'transcribing' | 'review'
  const [step, setStep] = useState('record')
  const [source, setSource] = useState('record') // 'record' | 'upload' — labels the discard button
  const [showUpload, setShowUpload] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)

  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)

  const mrRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const autoStopRef = useRef(null)

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  useEffect(() => () => {
    clearInterval(timerRef.current)
    clearTimeout(autoStopRef.current)
    if (mrRef.current?.state && mrRef.current.state !== 'inactive') mrRef.current.stop()
  }, [])

  const currentStepIndex = step === 'record' ? 0 : step === 'review' ? 1 : 0

  const transcribe = async (blob, filename) => {
    setStep('transcribing')
    setError(null)
    try {
      const t = await postAudio(blob, filename)
      setText(t)
      setStep('review')
    } catch (err) {
      setError(err.message || 'Could not reach the transcription service. Check your connection.')
      setStep('record')
    }
  }

  const startRec = async () => {
    setError(null)
    setRecSecs(0)
    chunksRef.current = []
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was denied. Allow it in your browser settings.')
      return
    }
    const mr = new MediaRecorder(stream)
    mrRef.current = mr
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      clearInterval(timerRef.current)
      clearTimeout(autoStopRef.current)
      setRecording(false)
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
      if (blob.size > MAX_BYTES) {
        setError('Recording is too large — try a shorter clip.')
        return
      }
      setSource('record')
      transcribe(blob, 'recording.webm')
    }
    mr.start(1000)
    setRecording(true)
    timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000)
    autoStopRef.current = setTimeout(() => {
      if (mrRef.current?.state !== 'inactive') mrRef.current.stop()
    }, MAX_RECORD_MS)
  }

  const stopRec = () => {
    if (mrRef.current?.state !== 'inactive') mrRef.current.stop()
  }

  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    if (f.size > MAX_BYTES) { setError('That file is over the 4 MB limit — try a shorter clip.'); return }
    setSource('upload')
    transcribe(f, f.name)
  }

  const addToPost = () => {
    const n = wordCount(text)
    toast.success(`Added ${n} ${n === 1 ? 'word' : 'words'} to your draft.`)
    onTranscribed(text)
  }

  const reset = () => {
    setText('')
    setError(null)
    setRecSecs(0)
    setStep('record')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#000]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dictate a post"
        className="vintage-border relative w-full max-w-md bg-[var(--color-bg-surface)] p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
        >
          ×
        </button>

        <h2 className="mb-4 font-serif text-xl font-black text-[var(--color-text-primary)]">Dictate a post</h2>

        {/* Stepper */}
        <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
          {STEPS.map((label, i) => (
            <span key={label} className="flex items-center gap-2">
              <span className={i === currentStepIndex ? 'text-[var(--color-accent-crimson)]' : 'text-[var(--color-text-secondary)]'}>
                {label}
              </span>
              {i < STEPS.length - 1 && <span className="text-[var(--color-text-secondary)]">→</span>}
            </span>
          ))}
        </div>

        <p className="mb-5 font-serif text-sm text-[var(--color-text-secondary)]">{HELPER}</p>

        {error && <p className="mb-4 font-mono text-xs text-[var(--color-ember)]">{error}</p>}

        {/* Record step */}
        {step === 'record' && (
          <div>
            {!recording && (
              <>
                <button
                  type="button"
                  onClick={startRec}
                  className="flex w-full items-center justify-center gap-2 bg-[var(--color-accent-crimson)] px-5 py-3 font-mono text-xs uppercase tracking-wider text-white transition-colors hover:bg-red-700 cursor-pointer"
                >
                  🎙 Tap to record
                </button>
                <button
                  type="button"
                  onClick={() => setShowUpload(v => !v)}
                  className="mt-4 w-full text-center font-mono text-xs text-[var(--color-text-secondary)] underline hover:text-[var(--color-text-primary)] cursor-pointer"
                >
                  or upload an audio file instead
                </button>
                {showUpload && (
                  <input
                    type="file"
                    accept={ACCEPTED}
                    onChange={onFileChange}
                    className="mt-3 w-full text-[var(--color-text-primary)]"
                  />
                )}
              </>
            )}
            {recording && (
              <div className="text-center">
                <p className="mb-1 font-mono text-2xl text-[var(--color-accent-crimson)]">
                  <span className="animate-pulse">●</span> REC · {fmtTime(recSecs)}
                </p>
                <p className="mb-4 font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">listening…</p>
                <button
                  type="button"
                  onClick={stopRec}
                  className="w-full border border-[var(--color-line)] px-5 py-3 font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] transition-colors hover:border-white cursor-pointer"
                >
                  ■ Stop &amp; review
                </button>
              </div>
            )}
          </div>
        )}

        {/* Transcribing step */}
        {step === 'transcribing' && (
          <p className="py-8 text-center font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">
            Transcribing…
          </p>
        )}

        {/* Review step */}
        {step === 'review' && (
          <div>
            <textarea
              aria-label="Transcript"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full resize-y border border-[var(--color-line)] bg-[var(--color-bg-primary)] p-3 font-serif text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-crimson)] focus:outline-none"
            />
            <p className="mb-4 mt-1 font-mono text-xs text-[var(--color-text-secondary)]">
              ~{wordCount(text)} {wordCount(text) === 1 ? 'word' : 'words'} transcribed
            </p>
            <button
              type="button"
              onClick={addToPost}
              className="w-full bg-[var(--color-accent-crimson)] px-5 py-3 font-mono text-xs uppercase tracking-wider text-white transition-colors hover:bg-red-700 cursor-pointer"
            >
              Add to post
            </button>
            <button
              type="button"
              onClick={reset}
              className="mt-2 w-full border border-[var(--color-line)] px-5 py-3 font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] transition-colors hover:border-white cursor-pointer"
            >
              {source === 'upload' ? 'Choose another file' : 'Re-record'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
