import { BOOKS } from '../data/books'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const BADGE_CLASS = { NEW:'', CRITIQUE:'cyan', COMPLETE:'gold' }
const COVER_SVG = (
  <svg viewBox="0 0 260 300" xmlns="http://www.w3.org/2000/svg">
    <line x1="0" y1="150" x2="260" y2="150" stroke="currentColor" strokeWidth="1" opacity=".4"/>
    <line x1="130" y1="0"  x2="130" y2="300" stroke="currentColor" strokeWidth="1" opacity=".4"/>
    <circle cx="130" cy="150" r="60" fill="none" stroke="currentColor" strokeWidth="1" opacity=".3"/>
    <circle cx="130" cy="150" r="30" fill="none" stroke="currentColor" strokeWidth="1" opacity=".2"/>
  </svg>
)

export default function Library() {
  useDocumentTitle('Library')
  return (
    <section className="surface active">
      <p className="eyebrow">▸ The Library</p>
      <h2 className="title">Shared <em>Work</em></h2>
      <p className="lede">Excerpts, shorts, and chapters left in the dark for others to find.</p>

      <div className="lib-grid">
        {BOOKS.map((b, i) => (
          <article key={i} className="book">
            {b.badge && (
              <div className={`badge${BADGE_CLASS[b.badge] ? ' '+BADGE_CLASS[b.badge] : ''}`}>
                {b.badge}
              </div>
            )}
            <div className={`cover ${b.cover}`}>
              <div className="title">{b.title}</div>
              {COVER_SVG}
            </div>
            <div className="meta">
              <div className="by">{b.by}</div>
              <h3>{b.title}</h3>
              <p>{b.lede}</p>
              <div className="row">
                <span>{b.chapters}</span>
                <span>{b.comments} comments</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
