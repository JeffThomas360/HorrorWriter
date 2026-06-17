import { useEffect, useRef } from 'react'
import { useOutletContext, useNavigate, Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useQuery } from '@tanstack/react-query'

const FALLBACK_TILES = [
  {
    tag: '// CRITIQUE',
    title: 'How do you write quiet horror?',
    body: 'A discussion on dread without a body count — the slow architecture of unease.',
    meta: '12 replies · 2h',
    hot: true,
  },
  {
    tag: '// WORKSHOP',
    title: 'First page, no mercy',
    body: 'Drop the first 250 words. We tell you whether we kept reading. And why we stopped.',
    meta: '34 replies · today',
  },
  {
    tag: '// LIBRARY',
    title: 'New shorts this week',
    body: 'Fresh pieces from the coven — left in the dark for others to find.',
    meta: '6 stories',
  },
]

const WHY = [
  {
    ic: 'I.',
    label: 'No algorithm',
    body: 'Chronological. Hand-curated. The best work rises because readers say so — not because a feed decided.',
  },
  {
    ic: 'II.',
    label: 'Real critique',
    body: 'A Critique Code every member agrees to. Praise is cheap; we deal in useful. Cruelty is shown the door.',
  },
  {
    ic: 'III.',
    label: 'No ads. Ever.',
    body: 'Member-supported. Your attention is not for sale. Your work is not the product.',
  },
]

const PROMPT = {
  label: '// Prompt of the Week',
  quote: 'Write 500 words about a house that remembers you, even though you have never been inside.',
  cite: 'Week of May 26 — submit by Sunday',
}

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
          tag: `// ${(t.categories?.name || 'THREAD').split('·')[0].toUpperCase().trim()}`,
          hot: i === 0,
          title: t.title,
          body: `Started by @${t.profiles?.handle || 'someone'}. Join the discussion in the dark.`,
          meta: `${t.replies_count || 0} replies`,
          id: t.id,
        }))
      }
      return FALLBACK_TILES
    }
  })

  const { data: stats } = useQuery({
    queryKey: ['homeStats'],
    queryFn: async () => {
      if (!supabase) return null
      const [w, s, t] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('books').select('id', { count: 'exact', head: true }),
        supabase.from('threads').select('id', { count: 'exact', head: true }),
      ])
      return {
        writers: w.count ?? 0,
        stories: s.count ?? 0,
        threads: t.count ?? 0,
      }
    }
  })

  useEffect(() => {
    const el = h1Ref.current
    if (!el) return
    const t = setTimeout(() => {
      el.classList.add('glitch')
      setTimeout(() => el.classList.remove('glitch'), 600)
    }, 500)
    return () => clearTimeout(t)
  }, [])

  const [hero, ...rest] = tiles

  return (
    <section className="surface">
      <div className="hero">
        <span className="kicker">Members · Writers Only · Founded 1986</span>
        <h1 ref={h1Ref} data-text="Write the things that keep them up.">
          Write the things <br /><span className="accent">that keep them up.</span>
        </h1>
        <p className="sub">
          A circle for serious horror writers — forums, critique, weekly prompts,
          and a coven that takes the craft as seriously as you do.
        </p>
        <div className="hero-ctas">
          {session ? (
            <button className="btn blood lg" onClick={() => navigate('/forum')}>
              Enter the Crypt
            </button>
          ) : (
            <button className="btn blood lg" onClick={() => ctx && ctx.openSignin()}>
              Join the Coven
            </button>
          )}
          <Link to="/library" className="btn ghost lg">Read the Library</Link>
        </div>

        <div className="hero-meta" aria-label="Site stats">
          <div className="stat">
            <span className="n">{stats?.writers?.toLocaleString() ?? '—'}</span>
            <span className="l">Writers</span>
          </div>
          <div className="stat">
            <span className="n">{stats?.stories?.toLocaleString() ?? '—'}</span>
            <span className="l">Stories shared</span>
          </div>
          <div className="stat">
            <span className="n">{stats?.threads?.toLocaleString() ?? '—'}</span>
            <span className="l">Threads in the Crypt</span>
          </div>
          <div className="stat">
            <span className="n">0</span>
            <span className="l">Ads, ever</span>
          </div>
        </div>
      </div>

      <div className="section-head">
        <div className="left">
          <p className="eyebrow">In the Crypt right now</p>
          <h2>The <em>conversations</em> tonight</h2>
        </div>
        <Link to="/forum" className="btn ghost">All threads →</Link>
      </div>

      <div className="feature-grid">
        <Link
          to={hero?.id ? `/forum/thread/${hero.id}` : '/forum'}
          className={`tile hero-tile ${hero?.hot ? 'hot' : ''}`}
        >
          <p className="tag">{hero?.tag}</p>
          <h3>{hero?.title}</h3>
          <p>{hero?.body}</p>
          <p className="meta">{hero?.meta}</p>
        </Link>

        <div className="sub-stack">
          {rest.slice(0, 2).map((t) => (
            <Link
              key={t.title + t.tag}
              to={t.id ? `/forum/thread/${t.id}` : '/forum'}
              className={`tile ${t.hot ? 'hot' : ''}`}
            >
              <p className="tag" style={t.tag?.includes('LIBRARY') ? {color:'var(--gold)'} : {}}>
                {t.tag}
              </p>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
              <p className="meta">{t.meta}</p>
            </Link>
          ))}
        </div>
      </div>

      <aside className="pull-quote" aria-label="Prompt of the week">
        <p className="label">{PROMPT.label}</p>
        <blockquote>{PROMPT.quote}</blockquote>
        <p className="cite">{PROMPT.cite}</p>
      </aside>

      <div className="why-section">
        <p className="eyebrow">Why this place</p>
        <h2 className="title" style={{ maxWidth: '14ch' }}>
          For writers who <em>mean it.</em>
        </h2>
        <div className="why-grid">
          {WHY.map((w) => (
            <div key={w.label} className="why-card">
              <div className="ic">{w.ic}</div>
              <h3>{w.label}</h3>
              <p>{w.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
