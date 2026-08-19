import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import MarkdownEditor from '../components/MarkdownEditor'
import CommunityGuidelines from '../components/CommunityGuidelines'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import TranscribeButton from '../components/TranscribeButton'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'

function CreateThread() {
  const { session, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!authLoading && !session) {
      window.location.replace('/forum')
    }
  }, [session, authLoading])

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
      window.location.replace('/forum')
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
    <div className="flex flex-col items-center justify-center min-h-[40vh]">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Verifying soul…</p>
    </div>
  )

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">The Crypt</span>
      <h2 className="text-3xl font-serif font-black mb-8">Summon <em className="italic text-[var(--color-accent-crimson)] font-serif">a thread</em></h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          >
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="A chilling subject…"
            className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Initial Post</label>
          <CommunityGuidelines />
          <MarkdownEditor
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What is on your mind?"
            rows={10}
            disabled={isSubmitting}
          />
          <div className="mt-2">
            <TranscribeButton
              onTranscribed={(text) => setContent(prev => prev ? `${prev}\n\n${text}` : text)}
            />
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 border-t border-[#2d2d2a] pt-6">
          <button 
            type="submit" 
            className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-5 py-3 hover:bg-red-700 transition-colors cursor-pointer"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Summoning…' : 'Post Thread'}
          </button>
          <button 
            type="button" 
            className="border border-[#2d2d2a] hover:border-white text-[var(--color-text-primary)] font-mono text-xs uppercase px-4 py-3 transition-colors cursor-pointer"
            onClick={() => window.location.replace('/forum')} 
            disabled={isSubmitting}
          >
            Cancel
          </button>
          {error && <span className="form-err font-mono text-xs text-[var(--color-accent-crimson)]">{error}</span>}
        </div>
      </form>
    </div>
  )
}

function CreateThreadWithAuth(props) {
  return (
    <RequireAuth>
      <CreateThread {...props} />
    </RequireAuth>
  )
}

export default withProviders(CreateThreadWithAuth)
