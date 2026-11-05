import { useState, useEffect } from 'react'
import { playWhisperEcho, playTypewriterKey } from '../lib/soundscapes'

// Authored writing prompts, not user submissions. Labelled SEED in the UI, the same way
// the public-domain classics are labelled ARCHIVE SAMPLE.
const SEED_WHISPERS = [
  {
    id: 'seed-1',
    text: 'I keep thinking about the fact that if a person I love was replaced by an exact double, I would never know until it was too late.',
    seed: true,
    category: 'The Uncanny',
  },
  {
    id: 'seed-2',
    text: 'When I lived in the cabin upstate, I heard crying beneath the living room floorboards. My father said it was pipes. The cabin had no plumbing.',
    seed: true,
    category: 'Rural Dread',
  },
  {
    id: 'seed-3',
    text: 'I’m not afraid of being alone in the dark. I’m afraid of realizing I’m not alone, but whatever is there refuses to make a sound.',
    seed: true,
    category: 'Sensory Isolation',
  },
  {
    id: 'seed-4',
    text: 'Every night at 3:12 AM, our baby monitor picks up static and the unmistakable sound of someone slowly turning the pages of an old book.',
    seed: true,
    category: 'Domestic Haunting',
  },
  {
    id: 'seed-5',
    text: 'I wrote a gruesome fictional murder scene ten years ago. Last winter, an unsolved disappearance in my hometown matched every single sentence.',
    seed: true,
    category: 'The Unwritten Curse',
  },
]

export default function VoidWhispers() {
  const [whispers, setWhispers] = useState(SEED_WHISPERS)
  const [inputVal, setInputVal] = useState('')
  const [isWhispering, setIsWhispering] = useState(false)
  const [claimedId, setClaimedId] = useState(null)
  const [dissolving, setDissolving] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hw_void_whispers')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWhispers([...parsed, ...SEED_WHISPERS])
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  function handleRelease(e) {
    e.preventDefault()
    if (!inputVal.trim()) return

    setDissolving(true)
    playWhisperEcho()

    setTimeout(() => {
      const newWhisper = {
        id: 'whisper-' + Date.now(),
        text: inputVal.trim(),
        seed: false,
        category: 'Your seed',
      }

      const updated = [newWhisper, ...whispers]
      setWhispers(updated)
      setInputVal('')
      setDissolving(false)
      setIsWhispering(false)

      try {
        const userSubmissions = updated.filter(w => !w.id.startsWith('seed-'))
        localStorage.setItem('hw_void_whispers', JSON.stringify(userSubmissions))
      } catch {
        // Ignore
      }
    }, 600)
  }

  function handleClaimSeed(item) {
    playTypewriterKey(false)
    navigator.clipboard?.writeText(item.text).then(() => {
      setClaimedId(item.id)
      setTimeout(() => setClaimedId(null), 2500)
    }).catch(() => {})
  }

  return (
    <section id="void-whispers" className="vintage-card p-6 sm:p-10 mb-20 relative overflow-hidden border-[var(--color-line)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-line)] pb-4 mb-8">
        <div>
          <span className="block font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-upside)] mb-1">
            ▸ Story seeds · short ideas to start from
          </span>
          <h2 className="text-2xl sm:text-3xl font-serif font-black">
            Whispers in <em className="italic text-[var(--color-ember)] font-serif">the Void</em>
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] font-serif mt-2 max-w-2xl leading-relaxed">
            Each card is a one-paragraph horror premise. Tap "Copy seed" to copy it, then paste it into a story or a Ritual to build from. Seeds you add stay on this device only; no one else sees them.
          </p>
        </div>

        <button
          onClick={() => {
            playTypewriterKey(false)
            setIsWhispering(!isWhispering)
          }}
          className="font-mono text-xs uppercase px-4 py-2.5 border border-[var(--color-ember)] text-[var(--color-ember)] hover:bg-[var(--color-ember)] hover:text-white transition-colors cursor-pointer self-start sm:self-auto"
        >
          {isWhispering ? 'Close' : '+ Add your own seed'}
        </button>
      </div>

      {/* Whisper Input Drawer */}
      {isWhispering && (
        <form onSubmit={handleRelease} className="mb-8 p-6 bg-[#0e060c] border border-[var(--color-line)] relative">
          <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-text-primary)] mb-2">
            Write a seed (kept on this device only):
          </label>
          <textarea
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="e.g. I live alone, but sometimes my footsteps on the hardwood have an echo that hesitates..."
            className={`w-full bg-[#050204] border border-[var(--color-line)] p-4 font-serif text-sm text-[var(--color-text-primary)] focus:border-[var(--color-ember)] focus:outline-none min-h-[100px] transition-opacity duration-500 ${
              dissolving ? 'opacity-20 animate-pulse' : 'opacity-100'
            }`}
            maxLength={280}
            required
          />
          <div className="flex justify-between items-center mt-3">
            <span className="font-mono text-xs text-[var(--color-text-secondary)]">
              {280 - inputVal.length} characters left
            </span>
            <button
              type="submit"
              disabled={dissolving || !inputVal.trim()}
              className="font-mono text-xs uppercase px-5 py-2.5 bg-[var(--color-accent-crimson)] text-white hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {dissolving ? 'Saving…' : 'Save seed'}
            </button>
          </div>
        </form>
      )}

      {/* Stream of Whispers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {whispers.map((item) => (
          <div
            key={item.id}
            className="p-5 border border-[var(--color-line)] bg-[#070306] flex flex-col justify-between group hover:border-[var(--color-upside)] transition-colors"
          >
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-upside)]">
                  {item.category}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                  {item.seed ? 'Seed' : 'Yours · this device'}
                </span>
              </div>
              <p className="font-serif italic text-base text-[var(--color-text-primary)] leading-relaxed mb-4">
                "{item.text}"
              </p>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-[var(--color-line)]/50">
              <button
                onClick={() => handleClaimSeed(item)}
                className="font-mono text-xs uppercase text-[var(--color-upside)] hover:text-white transition-colors cursor-pointer py-2 px-1 min-h-[44px]"
              >
                {claimedId === item.id ? '✓ Copied. Paste it into your story' : 'Copy seed'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
