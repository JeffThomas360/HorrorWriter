import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export default function PublishStory() {
  const { session, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const [title, setTitle] = useState('')
  const [lede, setLede] = useState('')
  const [cover, setCover] = useState('blood')
  const [content, setContent] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/library')
    }
  }, [session, authLoading, navigate])

  const mutation = useMutation({
    mutationFn: async ({ title, lede, cover, content }) => {
      const { data, error: bookError } = await supabase
        .from('books')
        .insert({
          title: title.trim(),
          lede: lede.trim(),
          cover: cover,
          content: content.trim(),
          author_id: session.user.id
        })
      if (bookError) throw bookError
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] })
      navigate('/library')
    },
    onError: (err) => {
      setError(err.message || 'Failed to publish story.')
    }
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

  if (authLoading || !session) return <div className="layout-content"><p className="dim">Verifying soul...</p></div>

  return (
    <div className="layout-content fade-in">
      <section className="surface active">
        <p className="eyebrow">▸ The Library</p>
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
            <div className="profile-field-input" style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              {['blood', 'cyan', 'bone'].map(c => (
                <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="cover" 
                    value={c} 
                    checked={cover === c} 
                    onChange={() => setCover(c)}
                  />
                  <span style={{ 
                    display: 'inline-block', 
                    width: 16, height: 16, 
                    backgroundColor: `var(--${c})`,
                    border: '1px solid rgba(255,255,255,0.2)'
                  }}></span>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </label>
              ))}
            </div>
          </label>

          <label className="profile-field">
            <div className="profile-field-label">Story Content</div>
            <div className="profile-field-input">
              <textarea 
                value={content} 
                onChange={(e) => setContent(e.target.value)} 
                required 
                rows={15} 
                placeholder="True!—nervous—very, very dreadfully nervous I had been and am; but why will you say that I am mad?"
                style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </label>

          <div className="profile-form-actions">
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? 'Publishing...' : '▸ Publish Story'}
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
