import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../components/AuthContext'

const AV_COLORS = ['', 'av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

function initials(handle) {
  if (!handle) return '??'
  return handle.split('-').map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

function timeAgo(dateString) {
  if (!dateString) return ''
  const d = new Date(dateString)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function readingTime(text) {
  if (!text) return null
  const words = text.trim().split(/\s+/).length
  const mins = Math.ceil(words / 200)
  return mins === 1 ? '~1 min read' : `~${mins} min read`
}

function StoryBody({ content }) {
  if (!content) return <p className="dim">This story has no text…</p>
  const paragraphs = content.split(/\n{2,}/).filter(p => p.trim())
  if (paragraphs.length === 0) return <p className="dim">This story has no text…</p>
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

  useDocumentTitle(book ? book.title : 'Reading…')

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

  if (loading) return (
    <section className="surface">
      <div className="status-panel">
        <p className="loading-pulse">Opening dusty pages…</p>
      </div>
    </section>
  )
  if (error) return (
    <section className="surface">
      <div className="status-panel">
        <p className="eyebrow error">Not found</p>
        <p className="status-panel-body">{error}</p>
        <Link to="/library" className="btn ghost">Back to Library</Link>
      </div>
    </section>
  )

  const isSubmitting = commentMutation.isPending
  const rtLabel = readingTime(book?.content)

  return (
    <section className="surface" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <p className="eyebrow">A story by @{book?.profiles?.handle || 'unknown'}</p>
        <h1 className="title" style={{ marginBottom: 18 }}>
          {book?.title}
        </h1>
        {book?.lede && (
          <p className="lede" style={{ margin: '0 auto 20px' }}>
            {book.lede}
          </p>
        )}
        {rtLabel && <span className="reading-time-chip">{rtLabel}</span>}
      </div>

      <StoryBody content={book?.content} />

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 48, marginTop: 56 }}>
        <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 26, color: 'var(--paper)', marginBottom: 24 }}>
          Critiques &amp; Responses <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({comments.length})</span>
        </h3>

        {commentsLoading ? (
          <p className="loading-pulse">Summoning critiques…</p>
        ) : comments.length === 0 ? (
          <p className="dim" style={{ marginBottom: 32 }}>
            The void is quiet. Leave the first critique below.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 40 }}>
            {comments.map((c) => {
              const handle = c.profiles?.handle || 'unknown'
              const avColorIndex = (handle.length % 6) + 1
              return (
                <article key={c.id} className="card">
                  <div className="author">
                    <div className={`avatar ${AV_COLORS[avColorIndex]}`} style={{ width: 36, height: 36, fontSize: 13 }}>
                      {initials(handle)}
                    </div>
                    <div className="who">
                      <span className="name">@{handle}</span>
                      <span className="when">{timeAgo(c.created_at)}</span>
                    </div>
                  </div>
                  <div className="body">{c.content}</div>
                </article>
              )
            })}
          </div>
        )}

        {session ? (
          <form onSubmit={handleCommentSubmit} style={{ marginTop: 32 }}>
            <h4 style={{ fontSize: 18, marginBottom: 12, color: 'var(--paper)', fontFamily: 'var(--display)', fontWeight: 700 }}>
              Leave a critique
            </h4>
            <div className="profile-field-input" style={{ marginBottom: 14 }}>
              <textarea
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder="Offer constructive dark wisdom…"
                rows={5}
                required
              />
            </div>
            <div className="row-flex">
              <button type="submit" className="btn blood" disabled={isSubmitting}>
                {isSubmitting ? 'Summoning…' : 'Post Critique'}
              </button>
              {commentError && <span className="form-err">{commentError}</span>}
            </div>
          </form>
        ) : (
          <div className="empty">
            <p>You must enter the void to critique.</p>
            <span className="soon-chip">Sign in to leave a critique</span>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', borderTop: '1px solid var(--line)', paddingTop: 32, marginTop: 56 }}>
        <Link to="/library" className="btn ghost">← Return to the Library</Link>
      </div>
    </section>
  )
}
