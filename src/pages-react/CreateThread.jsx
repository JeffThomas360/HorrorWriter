import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { screenContent } from '../lib/screenContent'
import { useAuth } from '../components/AuthContext'
import MarkdownEditor from '../components/MarkdownEditor'
import CommunityGuidelines from '../components/CommunityGuidelines'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import TranscribeButton from '../components/TranscribeButton'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'
import { fetchActivePrompts } from '../lib/ritualDraft'
import { threadPath } from '../lib/urls'

const ROTATING_FALLBACK_PROMPTS = [
  'The astronomer realized the stars were not burning out—something vast was standing between the telescope and the sky.',
  'Every year, the village buries a carved wooden effigy of the oldest resident. This year, the wood bled.',
  'You bought a blank VHS cassette at an estate sale. The footage is from inside your bedroom, filmed last night.',
  'For three weeks, your reflection in the bathroom mirror has been blinking half a second after you do.',
  'The radio emergency broadcast system activated at 3:17 AM. It repeated only three words: Do not look.',
]

function CreateThread() {
  const { session, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return params.get('cat') || ''
    }
    return ''
  })
  const [promptId, setPromptId] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return params.get('prompt') || ''
    }
    return ''
  })
  const [content, setContent] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!authLoading && !session) {
      window.location.replace('/forum/')
    }
  }, [session, authLoading])

  const { data: rawCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      if (!supabase) return []
      const { data, error } = await supabase.from('categories').select('*').order('sort_order')
      if (error) throw error
      return data || []
    }
  })

  const { data: activePrompts = [] } = useQuery({
    queryKey: ['activePrompts'],
    queryFn: () => fetchActivePrompts(5),
  })

  const promptOptions = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const p = activePrompts[i]
      return {
        id: p?.id || `prompt-${i}`,
        dbPromptId: p?.id || null,
        label: i === 0 ? 'Prompt 1 · Current Transmission' : `Prompt ${i + 1} · Week ${i + 1} of 5`,
        body: p?.body || ROTATING_FALLBACK_PROMPTS[i],
      }
    })
  }, [activePrompts])

  const categories = useMemo(() => {
    const list = [...rawCategories]
    if (!list.some(c => c.id === 'rituals')) {
      list.unshift({
        id: 'rituals',
        name: 'Midnight Rituals · Prompts',
        description: 'Five weekly rotating prompts and user story submissions for critique.',
        sort_order: 0,
      })
    }
    return list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [rawCategories])

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id)
    }
  }, [categories, categoryId])

  useEffect(() => {
    if (categoryId === 'rituals' && !promptId && promptOptions.length > 0) {
      setPromptId(promptOptions[0].dbPromptId || promptOptions[0].id)
    }
  }, [categoryId, promptId, promptOptions])

  const mutation = useMutation({
    mutationFn: async ({ title, categoryId, content, promptId }) => {
      const selectedSub = promptOptions.find(p => p.id === promptId || p.dbPromptId === promptId)
      const effectivePromptId = selectedSub?.dbPromptId || (promptId && !promptId.startsWith('prompt-') ? promptId : null)

      const { data, error } = await supabase.rpc('create_thread_with_post', {
        p_title: title.trim(),
        p_category_id: categoryId,
        p_content: content.trim(),
        p_prompt_id: categoryId === 'rituals' ? effectivePromptId : null,
      })
      if (error) throw error
      return { id: data }
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      await screenContent(supabase, 'thread', data?.id)
      window.location.replace(threadPath(data.id))
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
    mutation.mutate({ title, categoryId, content, promptId })
  }

  const isSubmitting = mutation.isPending

  if (authLoading || !session) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh]">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Verifying soul…</p>
    </div>
  )

  const selectedPrompt = promptOptions.find(p => p.id === promptId || p.dbPromptId === promptId)

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">The Crypt</span>
      <h2 className="text-3xl font-serif font-black mb-8">Summon <em className="italic text-[var(--color-accent-crimson)] font-serif">a thread</em></h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="thread-category" className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Category</label>
          <select
            id="thread-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          >
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {categoryId === 'rituals' && (
          <div className="p-4 border border-[var(--color-upside)] bg-[var(--color-void)] flex flex-col gap-3">
            <label className="text-xs font-mono text-[var(--color-upside)] uppercase font-bold">
              ◈ Midnight Ritual Prompt Sub-Category
            </label>
            <select
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              className="bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-upside)] focus:outline-none"
            >
              {promptOptions.map(p => (
                <option key={p.id} value={p.dbPromptId || p.id}>{p.label}</option>
              ))}
            </select>
            {selectedPrompt && (
              <blockquote className="font-serif italic text-xs text-[var(--color-text-primary)] border-l-2 border-l-[var(--color-upside)] pl-3 py-1 my-1">
                &ldquo;{selectedPrompt.body}&rdquo;
              </blockquote>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="A chilling subject…"
            className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
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

        <div className="flex items-center gap-4 mt-4 border-t border-[var(--color-line)] pt-6">
          <button 
            type="submit" 
            className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-5 py-3 hover:bg-red-700 transition-colors cursor-pointer"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Summoning…' : 'Post Thread'}
          </button>
          <button 
            type="button" 
            className="border border-[var(--color-line)] hover:border-white text-[var(--color-text-primary)] font-mono text-xs uppercase px-4 py-3 transition-colors cursor-pointer"
            onClick={() => window.location.replace('/forum/')} 
            disabled={isSubmitting}
          >
            Cancel
          </button>
          {error && <span className="form-err font-mono text-xs text-[var(--color-ember)]">{error}</span>}
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
