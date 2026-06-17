import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import MarkdownEditor from '../components/MarkdownEditor'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import TranscribeButton from '../components/TranscribeButton'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'

function wordCount(text) {
  if (!text || !text.trim()) return 0
  return text.trim().split(/\s+/).length
}

const COVER_OPTIONS = [
  { value: 'blood', label: 'Blood', color: '#991B1B' },
  { value: 'cyan',  label: 'Phantom', color: '#312e81' },
  { value: 'bone',  label: 'Bone',  color: '#E5E1D8' },
]

function PublishStory() {
  const { session, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  const [title,   setTitle]   = useState('')
  const [lede,    setLede]    = useState('')
  const [cover,   setCover]   = useState('blood')
  const [content, setContent] = useState('')
  const [error,   setError]   = useState(null)

  const [seriesId, setSeriesId] = useState('none')
  const [newSeriesTitle, setNewSeriesTitle] = useState('')

  const { data: mySeries = [] } = useQuery({
    queryKey: ['mySeries', session?.user?.id],
    queryFn: async () => {
      if (!session) return []
      const { data } = await supabase
        .from('series')
        .select('*')
        .eq('author_id', session.user.id)
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!session
  })

  useEffect(() => {
    if (!authLoading && !session) {
      window.location.replace('/library')
    }
  }, [session, authLoading])

  const mutation = useMutation({
    mutationFn: async ({ title, lede, cover, content, seriesId, newSeriesTitle }) => {
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

      if (seriesId === 'new' && newSeriesTitle.trim()) {
        const { data: createdSeries, error: sErr } = await supabase
          .from('series')
          .insert({ title: newSeriesTitle.trim(), author_id: session.user.id })
          .select('id')
          .single()
        if (!sErr && createdSeries) {
          await supabase.from('series_books').insert({ series_id: createdSeries.id, book_id: data.id })
        }
      } else if (seriesId && seriesId !== 'none') {
        await supabase.from('series_books').insert({ series_id: seriesId, book_id: data.id })
      }

      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['books'] })
      window.location.replace(data?.id ? `/library/read/${data.id}` : '/library')
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
    if (seriesId === 'new' && !newSeriesTitle.trim()) {
      setError('Please provide a title for the new series.')
      return
    }
    mutation.mutate({ title, lede, cover, content, seriesId, newSeriesTitle })
  }

  const isSubmitting = mutation.isPending
  const wc = wordCount(content)
  const readMins = wc > 0 ? Math.ceil(wc / 200) : null

  if (authLoading || !session) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh]">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Verifying soul…</p>
    </div>
  )

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--color-accent-crimson)] mb-2">The Library</span>
      <h2 className="title text-3xl font-serif font-black mb-8">Publish <em className="italic text-[var(--color-accent-crimson)] font-serif">a story</em></h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="The Tell-Tale Heart"
            className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Lede / Pitch</label>
          <input
            value={lede}
            onChange={(e) => setLede(e.target.value)}
            required
            placeholder="A short hook to draw readers in…"
            className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Series / Anthology</label>
          <select
            value={seriesId}
            onChange={(e) => setSeriesId(e.target.value)}
            className="bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          >
            <option value="none">Standalone Story</option>
            {mySeries.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            <option value="new">+ Create New Series</option>
          </select>
        </div>

        {seriesId === 'new' && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">New Series Title</label>
            <input
              value={newSeriesTitle}
              onChange={(e) => setNewSeriesTitle(e.target.value)}
              placeholder="e.g. The Haunted Trilogy"
              className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Cover Style</label>
          <div className="flex gap-4 flex-wrap">
            {COVER_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 cursor-pointer px-4 py-2 border transition-all ${cover === opt.value ? 'border-white bg-[#ffffff]/5' : 'border-[#2d2d2a]'}`}
              >
                <input
                  type="radio"
                  name="cover"
                  value={opt.value}
                  checked={cover === opt.value}
                  onChange={() => setCover(opt.value)}
                  className="hidden"
                />
                <span 
                  className="w-3.5 h-3.5 rounded-full inline-block shrink-0 border border-white/20"
                  style={{ backgroundColor: opt.color }}
                />
                <span className="text-xs font-mono uppercase tracking-wider">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-baseline mb-1">
            <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Story Content (Markdown)</label>
            {wc > 0 && (
              <span className="font-mono text-[10px] text-[var(--color-text-secondary)] tracking-wider">
                {wc.toLocaleString()} words{readMins ? ` · ~${readMins} min read` : ''}
              </span>
            )}
          </div>
          <MarkdownEditor
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="True!—nervous—very, very dreadfully nervous I had been and am; but why will you say that I am mad?"
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
            {isSubmitting ? 'Publishing…' : 'Publish Story'}
          </button>
          <button 
            type="button" 
            className="border border-[#2d2d2a] hover:border-white text-[var(--color-text-primary)] font-mono text-xs uppercase px-4 py-3 transition-colors cursor-pointer"
            onClick={() => window.location.replace('/library')} 
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

function PublishStoryWithAuth(props) {
  return (
    <RequireAuth>
      <PublishStory {...props} />
    </RequireAuth>
  )
}

export default withProviders(PublishStoryWithAuth)
