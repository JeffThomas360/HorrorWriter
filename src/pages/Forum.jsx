import { useState, useMemo } from 'react'
import { THREADS, CATEGORIES, CAT_LABELS } from '../data/threads'

const AV_COLORS = ['','av-1','av-2','av-3','av-4','av-5','av-6']

function initials(handle) {
  return handle.split('-').map(w => w[0].toUpperCase()).slice(0,2).join('')
}

export default function Forum() {
  const [activeCat, setActiveCat] = useState('all')
  const [query, setQuery]         = useState('')

  const visible = useMemo(() => {
    const base = activeCat === 'all' ? THREADS : THREADS.filter(t => t.cat === activeCat)
    if (!query.trim()) return base
    const q = query.toLowerCase()
    return base.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.by.toLowerCase().includes(q) ||
      (CAT_LABELS[t.cat] || '').includes(q)
    )
  }, [activeCat, query])

  return (
    <section className="surface active">
      <p className="eyebrow">▸ The Forums</p>
      <h2 className="title">The <em>Crypt</em></h2>
      <p className="lede">Where the conversations live. Pick a category, or search the dark.</p>

      <div className="forum-grid">
        <aside>
          <ul className="cat-list">
            {CATEGORIES.map(c => (
              <li
                key={c.id}
                className={c.id === activeCat ? 'active' : ''}
                onClick={() => setActiveCat(c.id)}
              >
                <span className="name">{c.name}</span>
                <span className="count">{c.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop:24, padding:'18px', border:'1px dashed rgba(243,236,217,.14)', borderRadius:'var(--r)' }}>
            <div className="eyebrow" style={{ marginBottom:6, fontSize:14 }}>▸ House Rules</div>
            <p style={{ color:'var(--bone-dim)', fontSize:15, fontStyle:'italic' }}>
              Read before posting. Critique is a gift; cruelty is not.
              Spoilers warned. No promo without a story attached.
            </p>
          </div>
        </aside>

        <div>
          <div className="forum-tools">
            <div className="search">
              <input
                placeholder="search threads, authors, tags…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search forum threads"
              />
            </div>
            <span className="soon-chip">New Thread · Soon</span>
          </div>

          {visible.length === 0 && (
            <p style={{ color:'var(--muted)', fontStyle:'italic', padding:'40px 0' }}>Nothing here. The dark is quiet tonight.</p>
          )}

          {visible.map((t, i) => (
            <div key={i} className="thread" role="article">
              <div className={`avatar ${AV_COLORS[t.av]}`}>{initials(t.by)}</div>
              <div className="body">
                <h4>
                  {t.pin && <span className="pin">📌 </span>}
                  {t.title}
                </h4>
                <div className="by">
                  <b>{t.by}</b>&nbsp;·&nbsp;{CAT_LABELS[t.cat] || t.cat}
                </div>
              </div>
              <div className="replies">
                <b>{t.replies}</b>
                <span>replies</span>
              </div>
              <div className="when">
                {t.when}
                <small>{t.whenSmall}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
