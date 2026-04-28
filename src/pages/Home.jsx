import { useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'

const LIVE = [
  { handle: 'lin-carver',        genre: 'Psychological' },
  { handle: 'marigold-rotten',   genre: 'Folk Horror'   },
  { handle: 'r-vespertine',      genre: 'Cosmic'        },
  { handle: 'theodora-bell',     genre: 'Gothic'        },
  { handle: 'roses-among-wires', genre: 'Body Horror'   },
]

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
        <div className="live-strip">
          {LIVE.map((w) => (
            <span key={w.handle}>
              <span className="dot" />
              <b>{w.handle}</b>&nbsp;&middot;&nbsp;{w.genre}
            </span>
          ))}
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

      <div id="why" style={{marginTop:'100px'}}>
        <p className="eyebrow">Why Join</p>
        <h2 style={{fontFamily:'var(--serif)',fontWeight:900,fontSize:'clamp(40px,6vw,76px)',color:'var(--bone)',letterSpacing:'.05em',lineHeight:1,marginBottom:'14px'}}>
          Built for writers who&nbsp;
          <span style={{color:'var(--blood)',textShadow:'0 0 20px rgba(255,31,58,.5)'}}>mean it.</span>
        </h2>
        <div id="why-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'24px',marginTop:'48px'}}>
          {WHY.map((w) => (
            <div key={w.label} className="tile" style={{textAlign:'center'}}>
              <div style={{fontFamily:'var(--mono)',fontSize:'22px',color:'var(--blood)',textShadow:'0 0 18px rgba(255,31,58,.6)',marginBottom:'14px',letterSpacing:'.3em'}}>{w.icon}</div>
              <h3 style={{fontSize:'20px',marginBottom:'10px'}}>{w.label}</h3>
              <p>{w.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{marginTop:'100px',textAlign:'center',padding:'72px 32px',border:'1px solid rgba(255,31,58,.25)',background:'radial-gradient(800px 400px at 50% 50%, rgba(255,31,58,.06), transparent 70%)',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'repeating-linear-gradient(45deg, rgba(255,31,58,.04) 0 2px, transparent 2px 16px)'}} />
        <p className="eyebrow" style={{marginBottom:'16px'}}>Invite Only</p>
        <h2 style={{fontFamily:'var(--serif)',fontWeight:900,fontSize:'clamp(32px,5vw,60px)',color:'var(--bone)',letterSpacing:'.04em',marginBottom:'18px'}}>Join the Coven</h2>
        <p style={{fontFamily:'var(--body)',fontStyle:'italic',color:'var(--bone-dim)',fontSize:'20px',maxWidth:'540px',margin:'0 auto 36px'}}>
          We are currently invite-only. Leave your email and we will summon you when a seat opens.
        </p>
        <form style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap'}} onSubmit={(e)=>{e.preventDefault();const i=e.target.querySelector('input');i.value='';i.placeholder='Your soul has been registered.'}}>
          <input type="email" required placeholder="your@email.com" style={{background:'rgba(0,0,0,.5)',border:'1px solid rgba(243,236,217,.25)',color:'var(--bone)',fontFamily:'var(--mono)',fontSize:'18px',padding:'14px 20px',outline:'none',minWidth:'280px',letterSpacing:'.05em'}} />
          <button type="submit" className="btn primary">Summon Me</button>
        </form>
      </div>
    </section>
  )
}
