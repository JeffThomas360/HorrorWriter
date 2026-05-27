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
  { value: 'blood', label: 'Blood',   color: 'var(--blood)' },
  { value: 'cyan',  label: 'Phantom', color: 'var(--cyan)'  },
  { value: 'bone',  label: 'Bone',    color: 'var(--bone)'  },
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

  if (authLoading || !session) return <div className="layout-content"><p className="dim">Verifying soul...</p></div>

  return (
    <div className="layout-content fade-in">
      <section className="surface active">
        <p className="eyebrow">&#9658; The Library</p>
        <h2 className="title">Publish <em>Story</em></h2>

        <form onSubmit={handleSubmit} className="profile-form" style={{ marginTop: '2rem' }}>

          <label className="profile-field">
            <div className="profile-field-label">Title</div>
            <div className="profile-field-input">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="The Tell-Tale Heart"
                style={{ width: '100%' }}
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
                placeholder="A short hook to draw readers in..."
                style={{ width: '100%' }}
              />
            </div>
          </label>

          <label className="profile-field">
            <div className="profile-field-label">Cover Color</div>
            <div className="profile-field-input" style={{ display: 'flex', gap: '1.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {COVER_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    cursor: 'pointer',
                    padding: '0.5rem 0.9rem',
                    border: `1px solid ${cover === opt.value ? opt.color : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 'var(--r)',
                    background: cover === opt.value ? `color-mix(in srgb, ${opt.color} 10%, transparent)` : 'transparent',
                    transition: 'border-color 0.2s, background 0.2s',
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
                    display: 'inline-block', width: 14, height: 14, borderRadius: 2,
                    backgroundColor: opt.color, flexShrink: 0,
                  }} />
                  <span style={{
                    color: cover === opt.value ? opt.color : 'var(--bone-dim)',
                    fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </label>

          <label className="profile-field">
            <div className="profile-field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span>Story Content</span>
              {wc > 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--bone-dim)', letterSpacing: '0.1em' }}>
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
                placeholder="True!&#8212;nervous&#8212;very, very dreadfully nervous I had been and am; but why will you say that I am mad?"
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-serif)',
                  fontSize: '1.1rem',
                  lineHeight: '1.8',
                  color: 'var(--bone)',
                }}
              />
            </div>
          </label>

          <div className="profile-form-actions">
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? 'Publishing...' : '&#9658; Publish Story'}
            </button>
            <button type="button" className="btn ghost" onClick={() => navigate('/library')} disabled={isSubmitting}>
              Cancel
            </button>
            {error && <span className="form-err" style={{ marginLeft: '1rem' }}>{error}</span>}
          </div>

        </form>
      </section>
    </div>
  )
}
