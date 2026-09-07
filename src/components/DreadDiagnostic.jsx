import { useState } from 'react'
import { playTypewriterKey, playDreadTone } from '../lib/soundscapes'

const QUESTIONS = [
  {
    id: 1,
    title: 'I. The First Breach',
    text: 'Where does fear strike your body first?',
    options: [
      { text: 'In the vast, icy realization of how small we are beneath an indifferent sky.', archetype: 'cosmic' },
      { text: 'In the quiet suspicion that my own memories have been altered while I slept.', archetype: 'psychological' },
      { text: 'In the visceral revolt of flesh, bone, and things shifting under the skin.', archetype: 'visceral' },
      { text: 'In the dark dirt, old trees, and rituals people in this town never mention.', archetype: 'folk' },
      { text: 'In the electric hum of a television left on in an empty room after midnight.', archetype: 'analog' },
    ]
  },
  {
    id: 2,
    title: 'II. The Monster’s Face',
    text: 'What is the true shape of the antagonist?',
    options: [
      { text: 'A silhouette that human retinas were never engineered to register.', archetype: 'cosmic' },
      { text: 'Someone who knows your name, your face, and your guilt intimately.', archetype: 'psychological' },
      { text: 'A living corruption that hungers to remodel human biology.', archetype: 'visceral' },
      { text: 'An ancient pact sealed in blood before this country had roads.', archetype: 'folk' },
      { text: 'A phantom frequency looping on a tape that was never manufactured.', archetype: 'analog' },
    ]
  },
  {
    id: 3,
    title: 'III. The Final Page',
    text: 'When the story ends, what lingers in the silence?',
    options: [
      { text: 'The crushing vertigo that human existence was an accidental footnote.', archetype: 'cosmic' },
      { text: 'The terrifying ambiguity of whether the terror was real or self-inflicted.', archetype: 'psychological' },
      { text: 'The wet, irregular sound of something breathing in the dark.', archetype: 'visceral' },
      { text: 'The roots drinking deeply from the fresh mound behind the barn.', archetype: 'folk' },
      { text: 'Gray static snow dancing across the phosphor screen forever.', archetype: 'analog' },
    ]
  },
  {
    id: 4,
    title: 'IV. The Dark Pact',
    text: 'Why do you choose to write what keeps people awake?',
    options: [
      { text: 'To peer past the veil into the majestic terror of the infinite void.', archetype: 'cosmic' },
      { text: 'To dissect the psychological rot that smiles in daylight.', archetype: 'psychological' },
      { text: 'To confront the undeniable frailty and horror of physical form.', archetype: 'visceral' },
      { text: 'To honor the old dread that cities tried and failed to bury.', archetype: 'folk' },
      { text: 'To record the ghosts trapped inside obsolete magnetic ribbons.', archetype: 'analog' },
    ]
  }
]

const ARCHETYPES = {
  cosmic: {
    id: 'cosmic',
    name: 'THE VOID-GAZER',
    frequency: 'CH 13.1 · FREQUENCY: 432 Hz SUB-VOICE',
    tagline: 'Cosmic Dread & Unknowable Geometry',
    signature: 'You do not write monsters with claws; you write truths so colossal they dissolve sanity upon contact.',
    talents: 'Numinous terror, deep celestial scale, architectural vertigo, sensory dissociation.',
    prompt: 'The deep-sea drilling platform penetrated a chamber that was mathematically larger on the inside than the planet itself.',
    seal: '🜏 VOID-GAZER',
  },
  psychological: {
    id: 'psychological',
    name: 'THE CHAMBERED MIND',
    frequency: 'CH 13.4 · FREQUENCY: 528 Hz PHANTOM TONE',
    tagline: 'Psychological Torment & Paranoia',
    signature: 'You know the most inescapable labyrinth is a person’s own skull. The lock is turned from the inside.',
    talents: 'Unreliable narration, creeping gaslight dread, intimate domestic terror, fragmented memories.',
    prompt: 'You found a photograph of your fifth birthday. You are not in the picture, but someone wearing your clothes is.',
    seal: '🜍 CHAMBERED-MIND',
  },
  visceral: {
    id: 'visceral',
    name: 'THE FLESH-ARCHITECT',
    frequency: 'CH 13.5 · FREQUENCY: 110 Hz PULSE BEAT',
    tagline: 'Body Horror & Biological Transgression',
    signature: 'You refuse to grant the body any sacred sanctity. You expose the vulnerable, wet machinery of life.',
    talents: 'Tactile sensory prose, physical metamorphoses, surgical uncanny, parasitic invasion.',
    prompt: 'During routine dental cleaning, the hygienist whispered: "These aren\'t human roots. They\'re holding your jaw closed."',
    seal: '🜛 FLESH-ARCHITECT',
  },
  folk: {
    id: 'folk',
    name: 'THE EARTH-BOUND',
    frequency: 'CH 13.2 · FREQUENCY: 216 Hz EARTH RESONANCE',
    tagline: 'Folk Occult & Ancient Reckoning',
    signature: 'You remember what modern asphalt tried to erase. The woods remember, the well remembers, the soil takes its due.',
    talents: 'Pagan cadence, generational curses, rural isolation, ritualistic inevitability.',
    prompt: 'The village never locks its doors at night—not out of trust, but because whatever knocks takes the hinges if denied.',
    seal: '🜚 EARTH-BOUND',
  },
  analog: {
    id: 'analog',
    name: 'THE STATIC-DRIFTER',
    frequency: 'CH 13.3 · FREQUENCY: 88.5 MHz LATE SIGNAL',
    tagline: 'Analog Liminal & Ghost Frequencies',
    signature: 'You dwell in dead media, abandoned public-access broadcasts, and magnetic tape recorded over forbidden sights.',
    talents: 'Surveillance dread, liminal spaces, retro uncanny, electromagnetic haunting.',
    prompt: 'A cassette player from 1984 begins playing ambient audio from whatever room you are currently standing in.',
    seal: '🜁 STATIC-DRIFTER',
  }
}

export default function DreadDiagnostic() {
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState([])
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  function handleSelect(archetype) {
    playTypewriterKey(false)
    const nextAnswers = [...answers, archetype]
    setAnswers(nextAnswers)

    if (currentStep + 1 < QUESTIONS.length) {
      setCurrentStep(currentStep + 1)
    } else {
      // Calculate winner
      const counts = nextAnswers.reduce((acc, a) => {
        acc[a] = (acc[a] || 0) + 1
        return acc
      }, {})
      let topArch = 'cosmic'
      let maxCount = -1
      Object.entries(counts).forEach(([arch, count]) => {
        if (count > maxCount) {
          maxCount = count
          topArch = arch
        }
      })
      playDreadTone()
      setResult(ARCHETYPES[topArch])
    }
  }

  function handleReset() {
    playTypewriterKey(true)
    setCurrentStep(0)
    setAnswers([])
    setResult(null)
    setCopied(false)
  }

  function handleCopyDossier() {
    if (!result) return
    const text = `=== HORROR WRITER: DREAD DOSSIER ===\nARCHETYPE: ${result.name} (${result.seal})\nFREQUENCY: ${result.frequency}\nSIGNATURE: ${result.signature}\nBESPOKE PROMPT: "${result.prompt}"\nDISCOVER YOUR ALIGNMENT: https://horrorwriter.org`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    })
  }

  return (
    <section id="dread-diagnostic" className="vintage-card p-6 sm:p-10 mb-20 relative overflow-hidden border-[var(--color-line)]">
      {/* Background CRT scanline glow */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)',
          backgroundSize: '100% 4px'
        }}
      />

      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--color-line)] pb-4 mb-8">
          <div>
            <span className="block font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-upside)] mb-1">
              ▸ Psychological Alignment · Channel 13 Diagnostic
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif font-black">
              The <em className="italic text-[var(--color-ember)] font-serif">Dread Spectrum</em>
            </h2>
          </div>
          <span className="font-mono text-xs text-[var(--color-text-secondary)] tracking-wider">
            {result ? 'DOSSIER GENERATED' : `STAGE ${currentStep + 1} OF ${QUESTIONS.length}`}
          </span>
        </div>

        {!result ? (
          <div>
            <div className="mb-6">
              <span className="font-mono text-xs text-[var(--color-accent-crimson)] uppercase tracking-widest block mb-1">
                {QUESTIONS[currentStep].title}
              </span>
              <p className="text-lg sm:text-xl font-serif font-bold text-[var(--color-text-primary)]">
                {QUESTIONS[currentStep].text}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {QUESTIONS[currentStep].options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelect(opt.archetype)}
                  className="group text-left p-4 border border-[var(--color-line)] hover:border-[var(--color-upside)] bg-[var(--color-bg-surface)] hover:bg-[#121c1f] transition-all flex items-start gap-4 cursor-pointer"
                >
                  <span className="font-mono text-xs text-[var(--color-upside)] mt-0.5 border border-[var(--color-line)] px-2 py-0.5 group-hover:border-[var(--color-upside)]">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-sm font-serif text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] leading-relaxed">
                    {opt.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-6 bg-[#11050a] border border-[var(--color-accent-crimson)] relative">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="font-mono text-xs text-[var(--color-ember)] tracking-widest block mb-1 uppercase">
                    Your Horror Archetype
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-serif font-black text-white tracking-wide">
                    {result.name}
                  </h3>
                  <span className="font-mono text-xs text-[var(--color-text-secondary)] mt-1 block">
                    {result.frequency}
                  </span>
                </div>
                <span className="font-mono text-sm px-3 py-1 bg-[var(--color-accent-crimson)] text-white font-bold border border-red-800">
                  {result.seal}
                </span>
              </div>

              <div className="space-y-4 font-serif text-sm border-t border-[var(--color-line)] pt-4 mt-4">
                <p className="italic text-[var(--color-text-primary)] leading-relaxed font-bold">
                  "{result.signature}"
                </p>
                <div>
                  <span className="font-mono text-xs uppercase tracking-wider text-[var(--color-upside)] block mb-1">
                    Narrative Affinities
                  </span>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    {result.talents}
                  </p>
                </div>
                <div className="bg-[#050204] p-4 border border-[var(--color-line)]">
                  <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-ember)] block mb-1">
                    Bespoke Writing Prompt
                  </span>
                  <p className="font-serif italic text-sm text-[var(--color-text-primary)] leading-relaxed">
                    "{result.prompt}"
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 items-center justify-between pt-2">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleCopyDossier}
                  className="font-mono text-xs uppercase px-5 py-3 border border-[var(--color-upside)] text-[var(--color-upside)] hover:bg-[var(--color-upside)] hover:text-black transition-colors cursor-pointer"
                >
                  {copied ? '✓ Dossier Copied' : 'Copy Talisman Dossier'}
                </button>
                <a
                  href={`/library/publish?prompt=${encodeURIComponent(result.prompt)}`}
                  className="font-mono text-xs uppercase px-5 py-3 bg-[var(--color-accent-crimson)] text-white hover:bg-red-700 transition-colors inline-block"
                >
                  Write in Studio →
                </a>
              </div>
              <button
                onClick={handleReset}
                className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)] hover:text-white transition-colors cursor-pointer underline"
              >
                Retake Diagnostic
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
