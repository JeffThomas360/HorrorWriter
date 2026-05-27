import { useEffect, useRef } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useQuery } from '@tanstack/react-query'

const FALLBACK_TILES = []

const WHY = [
  { icon: 'No.', label: 'No Algorithm', body: 'Chronological. Hand-curated. The best work rises because readers say so.' },
  { icon: 'Crit', label: 'Real Critique', body: 'A Critique Code every member agrees to. Praise is cheap; we deal in useful.' },
  { icon: '0ads', label: 'No Ads. Ever.', body: 'Member-supported. Your work is not the product.' },
]

export default function Home() {
  useDocumentTitle(null)
  const h1Ref = useRef(null)
  const ctx = useOutletContext()
  const navigate = useNavigate()
  const { session } = useAuth()

  const { data: tiles = FALLBACK_TILES } = useQuery({
    queryKey: ['recentThreads'],
    queryFn: async () => {
      if (!supabase) return FALLBACK_TILES
      const { data, error } = await supabase
        .from('threads')
        .select('*, categories(name), profiles(handle)')
        .order('updated_at', { ascending: false })
        .limit(3)
      
      if (error) throw error
      if (data && data.length > 0) {
        return data.map((t, i) => ({
          tag: `// ${(t.categories?.name || t.category_id || 'THREAD').split('·')[0].toUpperCase().trim()}`,
          hot: i === 0,
          title: t.title,
          body: `Started by ${t.profiles?.handle || 'someone'}. Join the discussion in the dark.`,
          meta: `${t.replies_count || 0} replies`,
          cyan: i === 1,
          gold: i === 2
        }))
      }
      return FALLBACK_TILES
    }
  })

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
          {session ? (
            <button className="btn primary" onClick={() => navigate('/forum')}>
              Enter the Crypt
            </button>
          ) : (
            <button className="btn primary" onClick={() => ctx && ctx.openSignin()}>
              Enter the Void
            </button>
          )}
          <a className="btn ghost" href="#why">What Is This?</a>
        </div>
      </div>

      <div className="feature-grid">
        {tiles.map((t) => (
          <div key={t.title + t.tag} className={t.hot ? 'tile hot' : 'tile'}>
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
