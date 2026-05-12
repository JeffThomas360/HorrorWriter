import { useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'

const TILES = [
  {
    tag: '// THE CRYPT',
    hot: true,
    title: "My MC won't bleed — first-person POV horror",
    body: 'Twenty-two replies and counting. lin-carver needs your help before the manuscript eats her.',
    meta: '22 replies · 14 min ago',
  },
  {
    tag: '// SEANCE',
    hot: false,
    title: 'Writing quiet horror without it going limp',
    body: 'marigold-rotten opens the floor. How do you sustain dread when nothing moves?',
    meta: '48 replies · 1 hr ago',
    cyan: true,
  },
  {
    tag: '// RITUALS',
    hot: false,
    title: 'Prompt #31 — The House Remembers',
    body: 'Six hundred words. One room. Something that should not be inside.',
    meta: '9 submissions · closes friday',
    gold: true,
  },
]

const WHY = [
  { icon: 'No.', label: 'No Algorithm', body: 'Chronological. Hand-curated. The best work rises because readers say so.' },
  { icon: 'Crit', label: 'Real Critique', body: 'A Critique Code every member agrees to. Praise is cheap; we deal in useful.' },
  { icon: 'Wkly', label: 'Weekly Rituals', body: 'Timed prompts, themed contests, and a leaderboard that resets with the moon.' },
  { icon: '0ads', label: 'No Ads. Ever.', body: 'Member-supported. Your work is not the product.' },
]

export default function Home() {
  const h1Ref = useRef(null)
  const ctx = useOutletContext()

  useEffect(() => {
    const el = h1Ref.current
    if (!el) return
    const t = setTimeout(() => {
      el.classList.add('glitch')
      setTimeout(() => el.classList.remove('glitch'), 800)
    }, 600)
    return () => clearTimeout(t)
  }, [])

  // Glitch on a loop
  useEffect(() => {
    const id = setInterval(() => {
      const el = h1Ref.current
      if (!el) return
      el.classList.add('glitch')
      setTimeout(() => el.classList.remove('glitch'), 800)
    }, 7000)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="surface active">
      <div className="hero">
        <p className="kicker">Est. The Witching Hour &nbsp;&middot;&nbsp; Members Only</p>
        <h1 ref={h1Ref} data-text="HORROR WRITER">HORROR WRITER</h1>
        <p className="sub">
          A circle for those who write the dark &mdash; forums, critique, weekly prompts,
          and a coven of ambitious horror writers who take the craft seriously.
        </p>
        <p className="sub2">No algorithm &nbsp;&middot;&nbsp; No ads &nbsp;&middot;&nbsp; No posturing</p>
        <div className="hero-ctas">
          <button className="btn primary" onClick={() => ctx && ctx.openSignin()}>
            Enter the Void
          </button>
          <a className="btn ghost" href="#why">What Is This?</a>
        </div>
      </div>

      <div className="feature-grid">
        {TILES.map((t) => (
          <div key={t.tag} className={t.hot ? 'tile hot' : 'tile'}>
            <p className="tag" style={t.cyan ? {color:'var(--cyan)'} : t.gold ? {color:'var(--gold)'} : {}}>
              {t.tag}
            </p>
            <h3>{t.title}</h3>
            <p>{t.body}</p>
            <p className="meta">{t.meta}</p>
          </div>
        ))}
      </div>

      <div id="why" className="why-section">
        <p className="eyebrow">Why Join</p>
        <h2 className="why-heading">
          Built for writers who&nbsp;<em>mean it.</em>
        </h2>
        <div id="why-grid">
          {WHY.map((w) => (
            <div key={w.label} className="tile" style={{textAlign:'center'}}>
              <div className="why-icon">{w.icon}</div>
              <h3 style={{fontSize:'20px',marginBottom:'10px'}}>{w.label}</h3>
              <p>{w.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
