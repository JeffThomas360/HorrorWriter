import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import MarkdownEditor from '../components/MarkdownEditor'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import TranscribeButton from '../components/TranscribeButton'

export default function CreateThread() {
  const { session, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!authLoading && !session) navigate('/forum')
  }, [session, authLoading, navigate])

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      if (!supabase) return []
      const { data, error } = await supabase.from('categories').select('*').order('sort_order')
      if (error) throw error
      return data || []
    }
  })

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id)
    }
  }, [categories, categoryId])

  const mutation = useMutation({
    mutationFn: async ({ title, categoryId, content }) => {
      const { data, error } = await supabase.rpc('create_thread_with_post', {
        p_title: title.trim(),
        p_category_id: categoryId,
        p_content: content.trim()
      })
      if (error) throw error
      return { id: data }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      navigate('/forum')
    },
    onError: (err) => {
      setError(err.message || 'Failed to summon thread.')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required.')
      return
    }
    mutation.mutate({ title, categoryId, content })
  }

  const isSubmitting = mutation.isPending

  if (authLoading || !session) return (
    <section className="surface">
      <div className="status-panel">
        <p className="loading-pulse">Verifying soul…</p>
      </div>
    </section>
  )

  return (
    <section className="surface" style={{ width: '100%', margin: '0 auto', maxWidth: 'var(--prose-w)' }}>
      <p className="eyebrow">The Crypt</p>
      <h2 className="title">Summon <em>a thread</em></h2>

      <form onSubmit={handleSubmit} className="profile-form" style={{ marginTop: 32 }}>
        <label className="profile-field">
          <div className="profile-field-label">Category</div>
          <div className="profile-field-input">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
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
              placeholder="A chilling subject…"
            />
          </div>
        </label>

        <label className="profile-field">
          <div className="profile-field-input" style={{ marginBottom: 32 }}>
            <div className="profile-field-label">Initial Post</div>
            <MarkdownEditor
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What is on your mind?"
              rows={10}
              disabled={isSubmitting}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <TranscribeButton
              onTranscribed={(text) => setContent(prev => prev ? `${prev}\n\n${text}` : text)}
            />
          </div>
        </label>

        <div className="profile-form-actions">
          <button type="submit" className="btn blood" disabled={isSubmitting}>
            {isSubmitting ? 'Summoning…' : 'Post Thread'}
          </button>
          <button type="button" className="btn ghost" onClick={() => navigate('/forum')} disabled={isSubmitting}>
            Cancel
          </button>
          {error && <span className="form-err">{error}</span>}
        </div>
      </form>
    </section>
  )
}
