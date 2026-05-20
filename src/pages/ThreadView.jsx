import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const AV_COLORS = ['','av-1','av-2','av-3','av-4','av-5','av-6']

function initials(handle) {
  if (!handle) return '??'
  return handle.split('-').map(w => w[0].toUpperCase()).slice(0,2).join('')
}

function timeAgo(dateString) {
  if (!dateString) return ''
  const d = new Date(dateString)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m`
  if (diff < 86400) return `${Math.floor(diff/3600)}h`
  return `${Math.floor(diff/86400)}d`
}

export default function ThreadView() {
  const { id } = useParams()
  const { session } = useAuth()
  
  const [thread, setThread] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Reply state
  const [replyContent, setReplyContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [replyError, setReplyError] = useState(null)

  useDocumentTitle(thread ? thread.title : 'Loading Thread...')

  const fetchThreadAndPosts = async () => {
    if (!supabase) return
    try {
      // 1. Fetch thread info
      const { data: tData, error: tErr } = await supabase
        .from('threads')
        .select('*, profiles(handle), categories(name)')
        .eq('id', id)
        .single()
      
      if (tErr) throw tErr
      setThread(tData)

      // 2. Fetch posts
      const { data: pData, error: pErr } = await supabase
        .from('posts')
        .select('*, profiles(handle)')
        .eq('thread_id', id)
        .order('created_at', { ascending: true })

      if (pErr) throw pErr
      setPosts(pData || [])
    } catch (err) {
      console.error(err)
      setError('Thread lost to the void. It may have been deleted.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchThreadAndPosts()
  }, [id])

  const handleReply = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setReplyError(null)

    if (!replyContent.trim()) {
      setReplyError('Cannot speak nothingness.')
      setIsSubmitting(false)
      return
    }

    try {
      const { error } = await supabase
        .from('posts')
        .insert({
          thread_id: id,
          author_id: session.user.id,
          content: replyContent.trim()
        })
      
      if (error) throw error

      setReplyContent('')
      // Re-fetch posts to show the new one
      await fetchThreadAndPosts()
    } catch (err) {
      setReplyError(err.message || 'Failed to post reply.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) return <section className="surface active"><p className="dim">Descending...</p></section>
  if (error) return <section className="surface active"><p className="error">{error}</p><Link to="/forum" className="btn ghost">Go Back</Link></section>

  return (
    <div className="layout-content fade-in">
      <section className="surface active">
        <Link to="/forum" className="eyebrow" style={{ display: 'inline-block', marginBottom: '1rem', color: 'var(--cyan)' }}>
          &larr; Back to {thread?.categories?.name || 'The Crypt'}
        </Link>
        <h2 className="title" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{thread?.title}</h2>
        
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {posts.map((p, index) => {
            const handle = p.profiles?.handle || 'unknown'
            const avColorIndex = (handle.length % 6) + 1
            
            return (
              <div key={p.id} style={{ 
                background: 'var(--void)', 
                padding: '1.5rem', 
                borderRadius: 'var(--r)',
                border: '1px solid rgba(255,255,255,0.05)',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <div className={`avatar ${AV_COLORS[avColorIndex]}`} style={{ width: 40, height: 40, fontSize: 14 }}>
                    {initials(handle)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--bone)' }}>@{handle}</div>
                    <div style={{ fontSize: 13, color: 'var(--bone-dim)' }}>
                      {index === 0 ? 'Original Post' : `Reply #${index}`} &middot; {timeAgo(p.created_at)}
                    </div>
                  </div>
                </div>
                
                <div style={{ 
                  color: 'var(--bone-dim)', 
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {p.content}
                </div>
              </div>
            )
          })}
        </div>

        {session ? (
          <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Leave a Reply</h3>
            <form onSubmit={handleReply}>
              <textarea 
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Speak into the void..."
                rows={5}
                required
                style={{ 
                  width: '100%', 
                  background: 'var(--void)', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--bone)',
                  padding: '1rem',
                  fontFamily: 'var(--font-mono)',
                  borderRadius: 'var(--r)',
                  resize: 'vertical',
                  marginBottom: '1rem'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button type="submit" className="btn primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Summoning...' : '▸ Post Reply'}
                </button>
                {replyError && <span className="error" style={{ fontSize: 14 }}>{replyError}</span>}
              </div>
            </form>
          </div>
        ) : (
          <div style={{ marginTop: '3rem', textAlign: 'center', padding: '2rem', background: 'var(--void)', borderRadius: 'var(--r)' }}>
            <p style={{ color: 'var(--bone-dim)', marginBottom: '1rem' }}>You must enter the void to reply.</p>
            <span className="soon-chip">Sign in to reply</span>
          </div>
        )}

      </section>
    </div>
  )
}
