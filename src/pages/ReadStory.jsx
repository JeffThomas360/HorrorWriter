import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../components/AuthContext'

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

function readingTime(text) {
  if (!text) return null
  const words = text.trim().split(/\s+/).length
  const mins = Math.ceil(words / 200)
  return mins === 1 ? '~1 min read' : `~${mins} min read`
}

function StoryBody({ content }) {
  if (!content) return <p className="dim">This story has no text...</p>
  const paragraphs = content.split(/\n{2,}/).filter(p => p.trim())
  if (paragraphs.length === 0) return <p className="dim">This story has no text...</p>
  return (
    <div className="story-body">
      {paragraphs.map((para, i) => (
        <p key={i} className={i === 0 ? 'story-para story-dropcap' : 'story-para'}>
          {para.trim()}
        </p>
      ))}
    </div>
  )
}

export default function ReadStory() {
  const { id } = useParams()
  const { session } = useAuth()
  const queryClient = useQueryClient()

  const [commentContent, setCommentContent] = useState('')
  const [commentError, setCommentError] = useState(null)

  const { data: book, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['book', id],
    queryFn: async () => {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('books')
        .select('*, profiles(handle)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    }
  })

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ['book_comments', id],
    queryFn: async () => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('book_comments')
        .select('*, profiles(handle)')
        .eq('book_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    }
  })

  useDocumentTitle(book ? book.title : 'Reading...')

  const commentMutation = useMutation({
    mutationFn: async (content) => {
      const { data, error } = await supabase
        .from('book_comments')
        .insert({
          book_id: id,
          author_id: session.user.id,
          content: content.trim()
        })
        .select('*, profiles(handle)')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      setCommentContent('')
      queryClient.invalidateQueries({ queryKey: ['book_comments', id] })
      queryClient.invalidateQueries({ queryKey: ['book', id] })
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
    onError: (err) => {
      setCommentError(err.message || 'Failed to post critique.')
    }
  })

  const handleCommentSubmit = (e) => {
    e.preventDefault()
    setCommentError(null)
    if (!commentContent.trim()) {
      setCommentError('Cannot speak nothingness.')
      return
    }
    commentMutation.mutate(commentContent)
  }

  const error = queryError ? 'Story not found in the archives.' : null

  if (loading) return <section className="surface active"><p className="dim">Opening dusty pages...</p></section>
  if (error) return <section className="surface active"><p className="error">{error}</p><Link to="/library" className="btn ghost">Back to Library</Link></section>

  const isSubmitting = commentMutation.isPending
  const rtLabel = readingTime(book?.content)

  return (
    <div className="layout-content fade-in">
      <section className="surface active" style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '4rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <p className="eyebrow" style={{ color: `var(--${book?.cover || 'cyan'})` }}>
            &#9658; A story by @{book?.profiles?.handle || 'unknown'}
          </p>
          <h1 className="title" style={{ fontSize: '3.5rem', marginBottom: '1.5rem', lineHeight: 1.1 }}>
            {book?.title}
          </h1>
          <p className="lede" style={{ fontStyle: 'italic', fontSize: '1.25rem', color: 'var(--bone-dim)', maxWidth: '600px', margin: '0 auto 1.25rem' }}>
            {book?.lede}
          </p>
          {rtLabel && (
            <span className="reading-time-chip">{rtLabel}</span>
          )}
        </div>

        <StoryBody content={book?.content} />

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '3rem', marginBottom: '4rem', marginTop: '4rem' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', color: 'var(--gold)', marginBottom: '2rem' }}>
            Critiques &amp; Responses ({comments.length})
          </h3>

          {commentsLoading ? (
            <p className="dim">Summoning critiques...</p>
          ) : comments.length === 0 ? (
            <p style={{ fontStyle: 'italic', color: 'var(--bone-dim)', marginBottom: '2rem' }}>
              The void is quiet. Leave the first critique below.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '3rem' }}>
              {comments.map((c) => {
                const handle = c.profiles?.handle || 'unknown'
                const avColorIndex = (handle.length % 6) + 1
                return (
                  <div key={c.id} style={{
                    background: 'var(--void)',
                    padding: '1.5rem',
                    borderRadius: 'var(--r)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <div className={`avatar ${AV_COLORS[avColorIndex]}`} style={{ width: 40, height: 40, fontSize: 14 }}>
                        {initials(handle)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--bone)' }}>@{handle}</div>
                        <div style={{ fontSize: 13, color: 'var(--bone-dim)' }}>{timeAgo(c.created_at)}</div>
                      </div>
                    </div>
                    <div style={{
                      color: 'var(--bone-dim)',
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'var(--font-serif)',
                      fontSize: '1rem'
                    }}>
                      {c.content}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {session ? (
            <form onSubmit={handleCommentSubmit} style={{ marginTop: '2rem' }}>
              <h4 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--bone)', fontFamily: 'var(--font-serif)' }}>
                Leave a Critique
              </h4>
              <textarea
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder="Offer constructive dark wisdom..."
                rows={5}
                required
                style={{
                  width: '100%',
                  background: 'var(--void)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--bone)',
                  padding: '1rem',
                  fontFamily: 'var(--font-serif)',
                  fontSize: '1rem',
                  lineHeight: 1.7,
                  borderRadius: 'var(--r)',
                  resize: 'vertical',
                  marginBottom: '1rem'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button type="submit" className="btn primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Summoning...' : '▸ Post Critique'}
                </button>
                {commentError && <span className="error" style={{ fontSize: 14 }}>{commentError}</span>}
              </div>
            </form>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--void)', borderRadius: 'var(--r)' }}>
              <p style={{ color: 'var(--bone-dim)', marginBottom: '1rem' }}>You must enter the void to critique.</p>
              <span className="soon-chip">Sign in to leave a critique</span>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem' }}>
          <Link to="/library" className="btn ghost">&larr; Return to The Library</Link>
        </div>
      </section>
    </div>
  )
}
