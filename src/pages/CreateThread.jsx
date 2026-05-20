import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'

export default function CreateThread() {
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  
  const [categories, setCategories] = useState([])
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [content, setContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Redirect if not logged in
    if (!authLoading && !session) {
      navigate('/forum')
    }
  }, [session, authLoading, navigate])

  useEffect(() => {
    async function loadCategories() {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order')
      if (data) {
        setCategories(data)
        if (data.length > 0) setCategoryId(data[0].id)
      }
    }
    loadCategories()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    if (!title.trim() || !content.trim()) {
      setError('Title and content are required.')
      setIsSubmitting(false)
      return
    }

    try {
      // 1. Create the thread
      const { data: threadData, error: threadError } = await supabase
        .from('threads')
        .insert({
          title: title.trim(),
          category_id: categoryId,
          author_id: session.user.id
        })
        .select()
        .single()

      if (threadError) throw threadError

      // 2. Create the initial post
      const { error: postError } = await supabase
        .from('posts')
        .insert({
          thread_id: threadData.id,
          author_id: session.user.id,
          content: content.trim()
        })

      if (postError) throw postError

      // Redirect back to forum (or to the specific thread once that page exists)
      navigate('/forum')
    } catch (err) {
      setError(err.message || 'Failed to summon thread.')
      setIsSubmitting(false)
    }
  }

  if (authLoading || !session) return <div className="layout-content"><p className="dim">Verifying soul...</p></div>

  return (
    <div className="layout-content fade-in">
      <section className="surface active">
        <p className="eyebrow">▸ The Crypt</p>
        <h2 className="title">Summon <em>Thread</em></h2>
        
        <form onSubmit={handleSubmit} className="profile-form" style={{ marginTop: '2rem' }}>
          <label className="profile-field">
            <div className="profile-field-label">Category</div>
            <div className="profile-field-input">
              <select 
                value={categoryId} 
                onChange={(e) => setCategoryId(e.target.value)}
                style={{ 
                  width: '100%', 
                  background: 'var(--void)', 
                  color: 'var(--bone)', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '8px 12px',
                  fontFamily: 'inherit'
                }}
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </label>

          <label className="profile-field">
            <div className="profile-field-label">Title</div>
            <div className="profile-field-input">
              <input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                required 
                placeholder="A chilling subject..."
                style={{ width: '100%' }}
              />
            </div>
          </label>

          <label className="profile-field">
            <div className="profile-field-label">Initial Post</div>
            <div className="profile-field-input">
              <textarea 
                value={content} 
                onChange={(e) => setContent(e.target.value)} 
                required 
                rows={8} 
                placeholder="Speak into the void..."
                style={{ width: '100%' }}
              />
            </div>
          </label>

          <div className="profile-form-actions">
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? 'Summoning...' : '▸ Post Thread'}
            </button>
            <button type="button" className="btn ghost" onClick={() => navigate('/forum')} disabled={isSubmitting}>
              Cancel
            </button>
            {error && <span className="form-err" style={{ marginLeft: '1rem' }}>{error}</span>}
          </div>
        </form>
      </section>
    </div>
  )
}
