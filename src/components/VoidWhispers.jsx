import { useState, useEffect } from 'react'
import { playWhisperEcho, playTypewriterKey } from '../lib/soundscapes'
import { useAuth } from './AuthContext'
import { withProviders } from './Providers'
import { fetchWhispers, releaseWhisper, WHISPER_MAX } from '../lib/whispers'

// Authored writing prompts, not user submissions. Labelled SEED in the UI, the same way
// seedArchives.js labels its public-domain tapes ARCHIVE SAMPLE.
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

function VoidWhispers() {
  const [whispers, setWhispers] = useState(SEED_WHISPERS)
  const [inputVal, setInputVal] = useState('')
  const [isWhispering, setIsWhispering] = useState(false)
  const [claimedId, setClaimedId] = useState(null)
  const [dissolving, setDissolving] = useState(false)
  const [error, setError] = useState(null)
  const { session } = useAuth()

  useEffect(() => {
    let cancelled = false
    fetchWhispers()
      .then(rows => {
        if (!cancelled && rows.length) setWhispers([...rows, ...SEED_WHISPERS])
      })
      .catch(() => {
        // A failed read must never take the section down — the seeds still stand
        // on their own as writing prompts.
      })
    return () => { cancelled = true }
  }, [])

  async function handleRelease(e) {
    e.preventDefault()
    if (!inputVal.trim()) return

    setError(null)
    setDissolving(true)
    playWhisperEcho()

    try {
      const saved = await releaseWhisper(inputVal)
      setWhispers(prev => [saved, ...prev])
      setInputVal('')
      setIsWhispering(false)
    } catch (err) {
      setError(err.message || 'The dark refused it. Try again.')
    } finally {
      setDissolving(false)
    }
  }

  function handleClaimSeed(item) {
    playTypewriterKey(false)
    navigator.clipboard.writeText(item.text).then(() => {
      setClaimedId(item.id)
      setTimeout(() => setClaimedId(null), 2500)
    })
  }

  return (
    <section id="void-whispers" className="vintage-card p-6 sm:p-10 mb-20 relative overflow-hidden border-[var(--color-line)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-line)] pb-4 mb-8">
        <div>
          <span className="block font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-upside)] mb-1">
            ▸ Writing Seeds · Prompt Well
          </span>
          <h2 className="text-2xl sm:text-3xl font-serif font-black">
            Whispers in <em className="italic text-[var(--color-ember)] font-serif">the Void</em>
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] font-serif mt-1">
            The fears we never speak aloud are the ones that beg to be written. Claim a seed, or release your own — shown to everyone without your name on it.
          </p>
        </div>

        {session ? (
          <button
            onClick={() => {
              playTypewriterKey(false)
              setIsWhispering(!isWhispering)
            }}
            className="font-mono text-xs uppercase px-4 py-2.5 border border-[var(--color-ember)] text-[var(--color-ember)] hover:bg-[var(--color-ember)] hover:text-white transition-colors cursor-pointer self-start sm:self-auto"
          >
            {isWhispering ? 'Close Well' : '+ Whisper a Fear'}
          </button>
        ) : (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-signin'))}
            className="font-mono text-xs uppercase px-4 py-2.5 border border-[var(--color-line)] text-[var(--color-text-secondary)] hover:border-white transition-colors cursor-pointer self-start sm:self-auto"
          >
            Sign in to whisper
          </button>
        )}
      </div>

      {/* Whisper Input Drawer */}
      {isWhispering && (
        <form onSubmit={handleRelease} className="mb-8 p-6 bg-[#0e060c] border border-[var(--color-line)] relative">
          <label className="block font-mono text-xs uppercase tracking-widest text-[var(--color-text-primary)] mb-2">
            Speak an unspoken fear into the dark (shown without your name):
          </label>
          <textarea
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="e.g. I live alone, but sometimes my footsteps on the hardwood have an echo that hesitates..."
            className={`w-full bg-[#050204] border border-[var(--color-line)] p-4 font-serif text-sm text-[var(--color-text-primary)] focus:border-[var(--color-ember)] focus:outline-none min-h-[100px] transition-opacity duration-500 ${
              dissolving ? 'opacity-20 animate-pulse' : 'opacity-100'
            }`}
            maxLength={WHISPER_MAX}
            required
          />
          {error && (
            <div className="mt-3 font-mono text-xs text-[var(--color-ember)]">{error}</div>
          )}
          <div className="flex justify-between items-center mt-3">
            <span className="font-mono text-xs text-[var(--color-text-secondary)]">
              {WHISPER_MAX - inputVal.length} glyphs left
            </span>
            <button
              type="submit"
              disabled={dissolving || !inputVal.trim()}
              className="font-mono text-xs uppercase px-5 py-2.5 bg-[var(--color-accent-crimson)] text-white hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {dissolving ? 'Dissolving into the dark…' : 'Release into the Dark'}
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
                  {item.seed ? 'Seed' : 'Anonymous'}
                </span>
              </div>
              <p className="font-serif italic text-sm text-[var(--color-text-primary)] leading-relaxed mb-4">
                "{item.text}"
              </p>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-[var(--color-line)]/50">
              <button
                onClick={() => handleClaimSeed(item)}
                className="font-mono text-xs uppercase text-[var(--color-upside)] hover:text-white transition-colors cursor-pointer"
              >
                {claimedId === item.id ? '✓ Seed Claimed!' : 'Claim as Story Seed →'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default withProviders(VoidWhispers)
