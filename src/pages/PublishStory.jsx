import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useMutation, useQueryClient } from '@tanstack/react-query'

function wordCount(text) {
  if (!text || !text.trim()) return 0
  return text.trim().split(/\s+/).length
}

const COVER_OPTIONS = [
  { value: 'blood', label: 'Blood', color: 'var(--blood)' },
  { value: 'cyan',  label: 'Phantom', color: 'var(--cyan)' },
  { value: 'bone',  label: 'Bone',  color: 'var(--paper)' },
]

export default function PublishStory() {
  const { session, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [title,   setTitle]   = useState('')
  const [lede,    setLede]    = useState('')
  const [cover,   setCover]   = useState('blood')
  const [content, setContent] = useState('')
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!authLoading && !session) navigate('/library')
  }, [session, authLoading, navigate])

  const mutation = useMutation({
    mutationFn: async ({ title, lede, cover, content }) => {
      const { data, error: bookError } = await supabase
        .from('books')
        .insert({
          title:     title.trim(),
          lede:      lede.trim(),
          cover:     cover,
          content:   content.trim(),
          author_id: session.user.id,
        })
        .select('id')
        .single()
      if (bookError) throw bookError
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['books'] })
      navigate(data?.id ? `/library/read/${data.id}` : '/library')
    },
    onError: (err) => {
      setError(err.message || 'Failed to publish story.')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    if (!title.trim() || !lede.trim() || !content.trim()) {
      setError('Title, lede, and content are required.')
      return
    }
    mutation.mutate({ title, lede, cover, content })
  }

  const isSubmitting = mutation.isPending
  const wc = wordCount(content)
  const readMins = wc > 0 ? Math.ceil(wc / 200) : null

  if (authLoading || !session) return (
    <section className="surface">
      <div className="status-panel">
        <p className="loading-pulse">Verifying soul…</p>
      </div>
    </section>
  )

  return (
    <section className="surface" style={{ maxWidth: 820, margin: '0 auto' }}>
      <p className="eyebrow">The Library</p>
      <h2 className="title">Publish <em>a story</em></h2>

      <form onSubmit={handleSubmit} className="profile-form" style={{ marginTop: 32 }}>
        <label className="profile-field">
          <div className="profile-field-label">Title</div>
          <div className="profile-field-input">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="The Tell-Tale Heart"
            />
          </div>
        </label>

        <label className="profile-field">
          <div className="profile-field-label">Lede / Pitch</div>
          <div className="profile-field-input">
            <input
              value={lede}
              onChange={(e) => setLede(e.target.value)}
              required
              placeholder="A short hook to draw readers in…"
            />
          </div>
        </label>

        <div className="profile-field">
          <div className="profile-field-label">Cover</div>
          <div className="profile-field-input" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', background: 'none', border: 'none', padding: 0 }}>
            {COVER_OPTIONS.map(opt => (
              <label
                key={opt.value}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '10px 16px',
                  border: `1px solid ${cover === opt.value ? opt.color : 'var(--line-strong)'}`,
                  borderRadius: 'var(--r-pill)',
                  background: cover === opt.value ? `color-mix(in srgb, ${opt.color} 12%, transparent)` : 'rgba(0,0,0,.3)',
                  transition: 'border-color .15s, background .15s',
                }}
              >
                <input
                  type="radio"
                  name="cover"
                  value={opt.value}
                  checked={cover === opt.value}
                  onChange={() => setCover(opt.value)}
                  style={{ display: 'none' }}
                />
                <span style={{
                  display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                  backgroundColor: opt.color, flexShrink: 0,
                  boxShadow: cover === opt.value ? `0 0 8px ${opt.color}` : 'none'
                }} />
                <span style={{
                  color: cover === opt.value ? 'var(--paper)' : 'var(--bone-soft)',
                  fontSize: 13, fontWeight: 500, fontFamily: 'var(--ui)',
                  letterSpacing: '0.02em',
                }}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <label className="profile-field">
          <div className="profile-field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span>Story Content</span>
            {wc > 0 && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'none' }}>
                {wc.toLocaleString()} words{readMins ? ` · ~${readMins} min read` : ''}
              </span>
            )}
          </div>
          <div className="profile-field-input">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={20}
              placeholder="True!—nervous—very, very dreadfully nervous I had been and am; but why will you say that I am mad?"
              style={{ fontFamily: 'var(--body)', fontSize: '1.1rem', lineHeight: 1.7 }}
            />
          </div>
        </label>

        <div className="profile-form-actions">
          <button type="submit" className="btn blood" disabled={isSubmitting}>
            {isSubmitting ? 'Publishing…' : 'Publish Story'}
          </button>
          <button type="button" className="btn ghost" onClick={() => navigate('/library')} disabled={isSubmitting}>
            Cancel
          </button>
          {error && <span className="form-err">{error}</span>}
        </div>
      </form>
    </section>
  )
}
