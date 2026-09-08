import { useState, useMemo } from 'react'
import { playTypewriterKey } from '../lib/soundscapes'

const FREQUENCIES = [
  {
    id: 'weekly',
    freq: 'CH 13.0',
    name: 'Weekly Ritual Broadcast',
    prompt: 'The voicemail on the answering machine is dated tomorrow at 3:17 AM. It is your voice, begging you not to open the refrigerator.',
    category: 'Ritual of the Week',
    constraint: 'Max 250 words',
  },
  {
    id: 'cosmic',
    freq: 'CH 13.1',
    name: 'Cosmic Dread',
    prompt: 'The astronomer realized the stars were not burning out—something vast was standing between the telescope and the sky.',
    category: 'Cosmic Horror',
    constraint: 'Max 250 words',
  },
  {
    id: 'folk',
    freq: 'CH 13.2',
    name: 'Folk & Ritual',
    prompt: 'Every year, the village buries a carved wooden effigy of the oldest resident. This year, the wood bleed.',
    category: 'Folk Horror',
    constraint: 'Max 250 words',
  },
  {
    id: 'analog',
    freq: 'CH 13.3',
    name: 'Found Footage / VHS',
    prompt: 'You bought a blank VHS cassette at an estate sale. The footage is from inside your childhood bedroom, filmed last night.',
    category: 'Analog Horror',
    constraint: 'Max 250 words',
  },
  {
    id: 'psychological',
    freq: 'CH 13.4',
    name: 'Psychological Unease',
    prompt: 'For three weeks, your reflection in the bathroom mirror has been blinking half a second after you do.',
    category: 'Psychological',
    constraint: 'Max 250 words',
  },
]

export default function MidnightRitual() {
  const [activeFreqIndex, setActiveFreqIndex] = useState(0)
  const [isWriting, setIsWriting] = useState(false)
  const [submissionText, setSubmissionText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const active = FREQUENCIES[activeFreqIndex]

  const wordCount = useMemo(() => {
    if (!submissionText) return 0
    const m = submissionText.trim().match(/\S+/g)
    return m ? m.length : 0
  }, [submissionText])

  const handleTune = (idx) => {
    setActiveFreqIndex(idx)
    playTypewriterKey(true)
  }

  const handleQuickSubmit = (e) => {
    e.preventDefault()
    if (!submissionText.trim()) return
    setSubmitted(true)
    playTypewriterKey(true)
  }

  return (
    <div className="midnight-ritual relative border border-[var(--color-upside)] bg-[var(--color-void)] p-6 my-10 overflow-hidden shadow-[0_0_30px_rgba(25,165,184,0.15)]">
      {/* CRT Scanline Overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(25,165,184,0.1) 0px, rgba(25,165,184,0.1) 1px, transparent 1px, transparent 3px)',
          backgroundSize: '100% 3px'
        }}
      />

      {/* Terminal Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] pb-4 mb-5">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-ember)] shadow-[0_0_10px_var(--color-ember)] animate-pulse" />
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-upside)] font-bold">
            The Midnight Ritual • Channel 13 Receiver
          </span>
        </div>

        {/* Frequencies Tuner */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] uppercase text-[var(--color-text-secondary)] mr-1">
            Signal:
          </span>
          {FREQUENCIES.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleTune(i)}
              className={`font-mono text-[10px] px-2 py-0.5 border transition-all cursor-pointer ${
                activeFreqIndex === i
                  ? 'bg-[var(--color-upside)] text-[var(--color-void)] border-[var(--color-upside)] font-black shadow-[0_0_10px_rgba(25,165,184,0.3)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-line)] hover:border-white'
              }`}
            >
              {f.freq}
            </button>
          ))}
        </div>
      </div>

      {/* Main Broadcast Box */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ember)] bg-[var(--color-ember)]/10 px-2 py-0.5 border border-[var(--color-ember)]/30">
              {active.category}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-text-secondary)] uppercase">
              {active.constraint}
            </span>
          </div>

          <blockquote
            className="text-lg sm:text-xl font-serif italic text-[var(--color-text-primary)] leading-relaxed my-3"
            style={{ textShadow: '0 0 12px rgba(25,165,184,0.2)' }}
          >
            &ldquo;{active.prompt}&rdquo;
          </blockquote>

          <p className="font-mono text-xs text-[var(--color-text-secondary)] mt-3">
            Can you summon 250 words before the signal cuts to static?
          </p>
        </div>

        {/* Interactive Ritual Action Buttons */}
        <div className="md:col-span-4 flex flex-col sm:flex-row md:flex-col gap-3 justify-center">
          <button
            type="button"
            onClick={() => setIsWriting(!isWriting)}
            className="border border-[var(--color-upside)] text-[var(--color-upside)] font-mono text-xs uppercase px-5 py-3 tracking-wider shadow-[0_0_20px_rgba(25,165,184,0.25)] hover:bg-[var(--color-upside)] hover:text-[var(--color-void)] transition-all cursor-pointer text-center font-bold"
          >
            {isWriting ? 'Dismiss Transmitter' : '⚡ Answer the Signal (250w)'}
          </button>

        </div>
      </div>

      {/* Embedded Instant Flash Writer Drawer */}
      {isWriting && (
        <div className="mt-6 border-t border-[var(--color-line)] pt-6 transition-all duration-300 animate-fadeIn">
          {submitted ? (
            <div className="p-6 bg-[var(--color-surface)] border border-[var(--color-upside)] text-center">
              <span className="text-3xl block mb-2">📼</span>
              <h4 className="font-serif text-xl font-black text-[var(--color-text-primary)] mb-2">
                Signal Recorded Into The Crypt
              </h4>
              <p className="font-serif italic text-sm text-[var(--color-text-secondary)] mb-4">
                Your flash piece has been cast into the dark. The coven will read your transmission.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false)
                  setIsWriting(false)
                  setSubmissionText('')
                }}
                className="font-mono text-xs uppercase px-4 py-2 border border-[var(--color-line)] text-[var(--color-text-primary)] hover:border-white"
              >
                Close Receiver
              </button>
            </div>
          ) : (
            <form onSubmit={handleQuickSubmit} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase text-[var(--color-text-secondary)]">
                  Live Response Terminal:
                </span>
                <span className={`font-mono text-xs font-bold ${wordCount > 250 ? 'text-[var(--color-ember)]' : 'text-[var(--color-upside)]'}`}>
                  {wordCount} / 250 words
                </span>
              </div>

              <textarea
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                placeholder="The radio dial clicked, and the voice began to whisper..."
                rows={6}
                required
                className="w-full bg-[var(--color-void)] text-[var(--color-text-primary)] border border-[var(--color-line)] p-4 font-serif text-sm leading-relaxed focus:border-[var(--color-upside)] outline-none"
              />

              <div className="flex items-center justify-between gap-4 mt-2">
                <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                  No account needed for flash drafts • Copy to keep
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsWriting(false)}
                    className="font-mono text-xs uppercase px-4 py-2 border border-[var(--color-line)] text-[var(--color-text-secondary)] hover:border-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={wordCount === 0 || wordCount > 250}
                    className="btn-vhs disabled:opacity-40 cursor-pointer"
                  >
                    Transcribe to Coven
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
