import { useState, useRef, useEffect } from 'react'

const TRANSCRIBE_URL = import.meta.env.VITE_TRANSCRIBE_URL
const MAX_BYTES = 4 * 1024 * 1024
const ACCEPTED = '.mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/ogg'
const MAX_RECORD_MS = 10 * 60 * 1000
const WARNING =
  'For best results, use clear speech in a quiet room. Background music, heavy accents, or low-quality recordings may produce errors. Max 4 MB (~4 min MP3).'

async function postAudio(blob, filename) {
  if (!TRANSCRIBE_URL) throw new Error('Transcription service is not configured.')
  const form = new FormData()
  form.append('audio', blob, filename)
  const res = await fetch(`${TRANSCRIBE_URL}/transcribe`, { method: 'POST', body: form })
  if (!res.ok) {
    let msg = 'Transcription failed.'
    try { const d = await res.json(); msg = d.error ?? msg } catch {} // eslint-disable-line no-empty
    throw new Error(msg)
  }
  const data = await res.json()
  return data.text
}

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function TranscribeModal({ onTranscribed, onClose }) {
  const [tab, setTab] = useState('upload')
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState(null)

  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const [recBlob, setRecBlob] = useState(null)
  const [recError, setRecError] = useState(null)

  const mrRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const autoStopRef = useRef(null)

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      clearTimeout(autoStopRef.current)
      if (mrRef.current?.state !== 'inactive') mrRef.current?.stop()
    }
  }, [])

  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setFileError(f.size > MAX_BYTES ? 'File exceeds the 4 MB limit.' : null)
    setError(null)
  }

  const transcribeFile = async () => {
    if (!file || fileError) return
    setIsBusy(true)
    setError(null)
    try {
      const text = await postAudio(file, file.name)
      onTranscribed(text)
    } catch (err) {
      setError(err.message || 'Could not reach the transcription service. Check your connection.')
    } finally {
      setIsBusy(false)
    }
  }

  const startRec = async () => {
    setRecError(null)
    setRecBlob(null)
    setRecSecs(0)
    chunksRef.current = []

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setRecError('Microphone access was denied. Allow it in your browser settings.')
      return
    }

    const mr = new MediaRecorder(stream)
    mrRef.current = mr

    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
      clearInterval(timerRef.current)
      setRecording(false)
      if (blob.size > MAX_BYTES) {
        setRecError('Recording is too large — try a shorter clip.')
        setRecBlob(null)
      } else {
        setRecError(null)
        setRecBlob(blob)
      }
    }

    mr.start(1000)
    setRecording(true)

    timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000)
    autoStopRef.current = setTimeout(() => {
      if (mrRef.current?.state !== 'inactive') {
        mrRef.current.stop()
        setRecError('Recording capped at 10 minutes.')
      }
    }, MAX_RECORD_MS)
  }

  const stopRec = () => {
    clearTimeout(autoStopRef.current)
    clearInterval(timerRef.current)
    if (mrRef.current?.state !== 'inactive') mrRef.current.stop()
  }

  const transcribeRec = async () => {
    if (!recBlob) return
    setIsBusy(true)
    setError(null)
    try {
      const text = await postAudio(recBlob, 'recording.webm')
      onTranscribed(text)
    } catch (err) {
      setError(err.message || 'Could not reach the transcription service. Check your connection.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        <div className="modal-header">
          <h2>Transcribe <em>Audio</em></h2>
        </div>

        <div style={{
          background: 'rgba(255,200,0,0.07)',
          border: '1px solid rgba(255,200,0,0.25)',
          borderRadius: 6,
          padding: '10px 14px',
          fontSize: 13,
          color: 'var(--bone-dim)',
          marginBottom: 20,
          lineHeight: 1.55,
        }}>
          ⚠ {WARNING}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['upload', 'record'].map(t => (
            <button
              key={t}
              type="button"
              className={`btn ${tab === t ? 'primary' : 'ghost'}`}
              onClick={() => setTab(t)}
              style={{ flex: 1, padding: '8px 0', fontSize: 13 }}
            >
              {t === 'upload' ? '📎 Upload File' : '🎙 Record'}
            </button>
          ))}
        </div>

        {tab === 'upload' && (
          <div>
            <input
              type="file"
              accept={ACCEPTED}
              onChange={onFileChange}
              style={{ width: '100%', marginBottom: 8, color: 'var(--bone)' }}
            />
            {file && !fileError && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
            {fileError && (
              <p style={{ color: 'var(--blood)', fontSize: 13, marginBottom: 8 }}>{fileError}</p>
            )}
            {error && (
              <p style={{ color: 'var(--blood)', fontSize: 13, marginBottom: 8 }}>{error}</p>
            )}
            <button
              type="button"
              className="btn blood full-width"
              onClick={transcribeFile}
              disabled={!file || !!fileError || isBusy}
            >
              {isBusy ? 'Transcribing…' : 'Transcribe'}
            </button>
          </div>
        )}

        {tab === 'record' && (
          <div>
            {!recording && !recBlob && (
              <button
                type="button"
                className="btn blood full-width"
                onClick={startRec}
                style={{ marginBottom: 8 }}
              >
                🎙 Start Recording
              </button>
            )}
            {recording && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <p style={{ fontFamily: 'var(--mono)', fontSize: 28, color: 'var(--blood)', margin: '0 0 12px' }}>
                  ● {fmtTime(recSecs)}
                </p>
                <button type="button" className="btn ghost full-width" onClick={stopRec}>
                  ■ Stop
                </button>
              </div>
            )}
            {recBlob && !recording && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--bone-dim)', marginBottom: 8 }}>
                  Recording ready · {fmtTime(recSecs)}
                </p>
                <button
                  type="button"
                  className="btn blood full-width"
                  onClick={transcribeRec}
                  disabled={isBusy}
                >
                  {isBusy ? 'Transcribing…' : 'Transcribe'}
                </button>
                <button
                  type="button"
                  className="btn ghost full-width"
                  onClick={() => { setRecBlob(null); setRecSecs(0); setRecError(null) }}
                  disabled={isBusy}
                  style={{ marginTop: 8 }}
                >
                  Record Again
                </button>
              </div>
            )}
            {recError && (
              <p style={{ color: 'var(--blood)', fontSize: 13, marginTop: 8 }}>{recError}</p>
            )}
            {error && (
              <p style={{ color: 'var(--blood)', fontSize: 13, marginTop: 8 }}>{error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
