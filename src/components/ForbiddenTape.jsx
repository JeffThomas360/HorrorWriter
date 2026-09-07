import { useState } from 'react'
import { playStaticGlitch, playDreadTone } from '../lib/soundscapes'

export default function ForbiddenTape() {
  const [unlocked, setUnlocked] = useState(false)

  function handlePlayTape() {
    playStaticGlitch()
    setTimeout(() => {
      playDreadTone()
    }, 150)
    setUnlocked(true)
  }

  return (
    <div className="border border-[var(--color-accent-crimson)] bg-[#120409] p-6 relative overflow-hidden my-8">
      {/* Caution tape bar across the top */}
      <div 
        className="h-3 w-full mb-4 opacity-70"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, #000, #000 10px, #C8102E 10px, #C8102E 20px)'
        }}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-red-500 font-bold">
              CLASSIFIED ARCHIVE · RESTRICTED PLAYBACK
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-serif font-black text-white">
            TAPE #00: <em className="italic text-[var(--color-ember)] font-serif">DO NOT PLAY</em>
          </h3>
          <p className="font-serif italic text-xs text-[var(--color-text-secondary)] max-w-xl">
            A master cassette recovered from the 1986 late-night broadcast frequency. The seal remains intact.
          </p>
        </div>

        <div>
          {!unlocked ? (
            <button
              onClick={handlePlayTape}
              className="group relative font-mono text-xs uppercase px-6 py-3.5 bg-red-950/80 border border-[var(--color-accent-crimson)] text-white hover:bg-red-900 transition-all cursor-pointer shadow-[0_0_15px_rgba(200,16,46,0.3)] hover:shadow-[0_0_25px_rgba(200,16,46,0.6)]"
            >
              <span className="flex items-center gap-2">
                <span>▶</span>
                <span>Break Seal & Play</span>
              </span>
            </button>
          ) : (
            <span className="font-mono text-xs uppercase text-[var(--color-ember)] border border-[var(--color-ember)] px-4 py-2">
              SIGNAL ACTIVE
            </span>
          )}
        </div>
      </div>

      {unlocked && (
        <div className="mt-6 pt-6 border-t border-[var(--color-accent-crimson)]/40 bg-black/60 p-6 space-y-4 font-mono text-xs text-[var(--color-text-secondary)]">
          <div className="flex justify-between items-center text-[var(--color-ember)]">
            <span>[SIGNAL INTERCEPT // OCT 31, 1986]</span>
            <button 
              onClick={() => setUnlocked(false)}
              className="text-white hover:underline cursor-pointer"
            >
              [EJECT TAPE]
            </button>
          </div>

          <p className="font-serif italic text-sm sm:text-base text-white leading-relaxed">
            "If you are listening to this, you are one of the few who still understands why stories must bleed. 
            The algorithm wants you to write comfort. The market wants formula. 
            We built this coven so the dark has a place to breathe."
          </p>

          <div className="p-4 bg-[#14060c] border border-red-900/60 text-[var(--color-text-primary)]">
            <span className="text-[var(--color-ember)] font-bold block mb-1">
              THE PACT OF THE TAPE:
            </span>
            <p className="font-serif text-xs leading-relaxed">
              Every member who signs their name before midnight is granted permanent Founding Member status, 
              unfiltered critique access, and the right to broadcast on Channel 13.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-signin'))}
              className="font-mono text-xs uppercase px-6 py-3 bg-[var(--color-ember)] text-white font-bold hover:bg-red-600 transition-colors cursor-pointer"
            >
              Claim Founding Coven Status →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
