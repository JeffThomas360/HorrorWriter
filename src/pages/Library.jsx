import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useAuth } from '../components/AuthContext'
import { useQuery } from '@tanstack/react-query'

const BADGE_CLASS = { NEW:'', CRITIQUE:'cyan', COMPLETE:'gold' }
const COVER_SVG = (
  <svg viewBox="0 0 260 300" xmlns="http://www.w3.org/2000/svg">
    <line x1="0" y1="150" x2="260" y2="150" stroke="currentColor" strokeWidth="1" opacity=".4"/>
    <line x1="130" y1="0"  x2="130" y2="300" stroke="currentColor" strokeWidth="1" opacity=".4"/>
    <circle cx="130" cy="150" r="60" fill="none" stroke="currentColor" strokeWidth="1" opacity=".3"/>
    <circle cx="130" cy="150" r="30" fill="none" stroke="currentColor" strokeWidth="1" opacity=".2"/>
  </svg>
)

function postedAgo(dateString) {
  if (!dateString) return null
  const d = new Date(dateString)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Posted today'
  if (diffDays === 1) return 'Posted yesterday'
  if (diffDays < 30) return `Posted ${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `Posted ${diffMonths}mo ago`
  return `Posted ${Math.floor(diffMonths / 12)}y ago`
}

export default function Library() {
  useDocumentTitle('Library')
  const { session } = useAuth()

  const { data: books = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('books')
        .select('*, profiles(handle)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    }
  })

  const error = queryError ? queryError.message : null

  if (loading) return (
    <section className="surface active">
      <div style={{ padding: '80px 0', textAlign: 'center' }}>
        <p className="loading-pulse">Loading the dark archives...</p>
      </div>
    </section>
  )
  if (error) return (
    <section className="surface active">
      <p className="error">Error loading library: {error}</p>
    </section>
  )

  return (
    <section className="surface active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p className="eyebrow">&#9658; The Library</p>
          <h2 className="title">Shared <em>Work</em></h2>
          <p className="lede">Excerpts, shorts, and chapters left in the dark for others to find.</p>
        </div>
        {session ? (
          <Link to="/library/publish" className="btn primary" style={{ marginTop: '2rem' }}>
            &#9658; Publish Story
          </Link>
        ) : (
          <span className="soon-chip" style={{ marginTop: '2.5rem' }}>Sign in to publish</span>
        )}
      </div>

      {books.length === 0 && (
        <div style={{ marginTop: '2rem', padding: '60px 0', textAlign: 'center', border: '1px dashed rgba(243,236,217,.1)', borderRadius: 'var(--r)' }}>
          <p style={{ color:'var(--muted)', fontStyle:'italic', fontSize: '18px', marginBottom: '20px' }}>
            The library is currently empty.
          </p>
          {session ? (
            <Link to="/library/publish" className="btn ghost">Publish the first story</Link>
          ) : (
            <span className="soon-chip">Sign in to publish</span>
          )}
        </div>
      )}

      <div className="lib-grid" style={books.length > 0 ? { marginTop: '2rem' } : { display: 'none' }}>
        {books.map((b) => (
          <Link key={b.id} to={`/library/read/${b.id}`} className="book" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
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
              <div className="by">@{b.profiles?.handle || 'unknown'}</div>
              <h3>{b.title}</h3>
              <p>{b.lede}</p>
              <div className="row">
                <span>{postedAgo(b.created_at)}</span>
                <span>{b.comments_count || 0} {b.comments_count === 1 ? 'critique' : 'critiques'}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
