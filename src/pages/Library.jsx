import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useAuth } from '../components/AuthContext'
import { useQuery } from '@tanstack/react-query'
import Skeleton from '../components/Skeleton'

const BADGE_CLASS = { NEW: '', CRITIQUE: 'cyan', COMPLETE: 'gold' }

const COVER_SVG = (
  <svg viewBox="0 0 260 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <line x1="0" y1="160" x2="260" y2="160" stroke="currentColor" strokeWidth="1" opacity=".35" />
    <line x1="130" y1="0" x2="130" y2="320" stroke="currentColor" strokeWidth="1" opacity=".35" />
    <circle cx="130" cy="160" r="64" fill="none" stroke="currentColor" strokeWidth="1" opacity=".28" />
    <circle cx="130" cy="160" r="32" fill="none" stroke="currentColor" strokeWidth="1" opacity=".2" />
  </svg>
)

function postedAgo(dateString) {
  if (!dateString) return null
  const d = new Date(dateString)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return `${Math.floor(diffMonths / 12)}y ago`
}

export default function Library() {
  useDocumentTitle('Library')
  const { session } = useAuth()
  const [feedMode, setFeedMode] = useState('all')

  const { data: books = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['books', feedMode, session?.user?.id],
    queryFn: async () => {
      if (!supabase) return []
      
      let query = supabase
        .from('books')
        .select('*, profiles(handle)')
        .order('created_at', { ascending: false })

      if (feedMode === 'following' && session) {
        const { data: follows } = await supabase
          .from('user_follows')
          .select('following_id')
          .eq('follower_id', session.user.id)
        
        const authorIds = follows?.map(f => f.following_id) || []
        if (authorIds.length === 0) return [] // Following nobody
        
        query = query.in('author_id', authorIds)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    }
  })

  const error = queryError ? queryError.message : null

  return (
    <section className="surface">
      <div className="section-head" style={{ marginBottom: 24 }}>
        <div className="left">
          <p className="eyebrow">The Library</p>
          <h2>Shared <em>work</em></h2>
          <p>Excerpts, shorts, and chapters left in the dark for others to find.</p>
        </div>
        {session ? (
          <Link to="/library/publish" className="btn blood">Publish a Story</Link>
        ) : (
          <span className="soon-chip">Sign in to publish</span>
        )}
      </div>

      {session && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
          <button 
            className={`btn ${feedMode === 'all' ? 'blood' : 'ghost'}`} 
            onClick={() => setFeedMode('all')}
            style={{ fontSize: 13, padding: '6px 12px' }}
          >
            All Stories
          </button>
          <button 
            className={`btn ${feedMode === 'following' ? 'blood' : 'ghost'}`} 
            onClick={() => setFeedMode('following')}
            style={{ fontSize: 13, padding: '6px 12px' }}
          >
            My Feed
          </button>
        </div>
      )}

      {loading && (
        <div className="lib-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="book" style={{ border: 'none', background: 'transparent' }}>
              <Skeleton height="320px" borderRadius="8px" />
              <div style={{ marginTop: 16 }}>
                <Skeleton height="16px" width="40%" style={{ marginBottom: 12 }} />
                <Skeleton height="24px" width="90%" style={{ marginBottom: 8 }} />
                <Skeleton height="24px" width="60%" style={{ marginBottom: 16 }} />
                <Skeleton height="14px" width="30%" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="status-panel">
          <p className="eyebrow error">Error loading library</p>
          <p className="status-panel-body">{error}</p>
        </div>
      )}

      {!loading && !error && books.length === 0 && (
        <div className="empty">
          <p>The library is currently empty.</p>
          {session ? (
            <Link to="/library/publish" className="btn ghost">Publish the first story</Link>
          ) : (
            <span className="soon-chip">Sign in to publish</span>
          )}
        </div>
      )}

      {!loading && !error && books.length > 0 && (
        <div className="lib-grid">
          {books.map((b) => (
            <Link key={b.id} to={`/library/read/${b.id}`} className="book">
              {b.badge && (
                <div className={`badge${BADGE_CLASS[b.badge] ? ' ' + BADGE_CLASS[b.badge] : ''}`}>
                  {b.badge}
                </div>
              )}
              <div className={`cover ${b.cover || 'red'}`}>
                <div className="title">{b.title}</div>
                {COVER_SVG}
              </div>
              <div className="meta">
                <div className="by">@{b.profiles?.handle || 'unknown'}</div>
                <h3>{b.title}</h3>
                <p>{b.lede}</p>
                <div className="row">
                  <span>{postedAgo(b.created_at)}</span>
                  <span>
                    {b.comments_count || 0} {b.comments_count === 1 ? 'critique' : 'critiques'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
