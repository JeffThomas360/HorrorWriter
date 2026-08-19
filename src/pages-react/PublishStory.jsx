import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import MarkdownEditor from '../components/MarkdownEditor'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { fetchAuthorSeriesOptions, addBookToSeries } from '../lib/series'
import { validateStoryContent, countWords } from '../lib/storyValidation'
import { saveDraft, getDraft, clearDraft } from '../lib/draftAutosave'
import TranscribeButton from '../components/TranscribeButton'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'

const COVER_OPTIONS = [
  { value: 'blood', label: 'Blood', color: 'var(--color-blood)' },
  { value: 'cyan',  label: 'Phantom', color: 'var(--color-upside)' },
  { value: 'bone',  label: 'Bone',  color: '#E5E1D8' },
]

function PublishStory({ bookId }) {
  const { session, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  const [title,   setTitle]   = useState('')
  const [lede,    setLede]    = useState('')
  const [cover,   setCover]   = useState('blood')
  const [content, setContent] = useState('')
  const [error,   setError]   = useState(null)
  const [seriesId, setSeriesId] = useState('')
  const [activeTab, setActiveTab] = useState('write') // 'write' | 'preview'
  const [currentVersion, setCurrentVersion] = useState(1)
  const [fetchingBook, setFetchingBook] = useState(Boolean(bookId))

  const [pendingDraft, setPendingDraft] = useState(null)

  const draftKey = bookId ? `edit_${bookId}` : 'new_story'

  // Fetch story details if in Edit Mode (bookId)
  useEffect(() => {
    if (!bookId || !session?.user?.id) return
    let isMounted = true
    setFetchingBook(true)

    const loadBook = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('books')
          .select('*, series_books(series_id)')
          .eq('id', bookId)
          .single()

        if (fetchErr) throw fetchErr
        if (!data) throw new Error('Story not found.')

        if (isMounted) {
          setTitle(data.title || '')
          setLede(data.lede || '')
          setCover(data.cover || 'blood')
          setContent(data.content || '')
          setCurrentVersion(data.version || 1)
          if (Array.isArray(data.series_books) && data.series_books.length > 0) {
            setSeriesId(data.series_books[0].series_id || '')
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load story for editing.')
      } finally {
        if (isMounted) setFetchingBook(false)
      }
    }

    loadBook()
    return () => { isMounted = false }
  }, [bookId, session])

  // Check for unsaved draft in localStorage
  useEffect(() => {
    const saved = getDraft(draftKey)
    if (saved && (saved.title || saved.content)) {
      setPendingDraft(saved)
    }
  }, [draftKey])

  // Auto-save draft on typing (debounced 2s)
  useEffect(() => {
    if (authLoading || fetchingBook) return
    if (!title && !lede && !content) return

    const timer = setTimeout(() => {
      saveDraft(draftKey, { title, lede, cover, content, seriesId })
    }, 1500)

    return () => clearTimeout(timer)
  }, [title, lede, cover, content, seriesId, draftKey, authLoading, fetchingBook])

  const handleRestoreDraft = () => {
    if (!pendingDraft) return
    if (pendingDraft.title) setTitle(pendingDraft.title)
    if (pendingDraft.lede) setLede(pendingDraft.lede)
    if (pendingDraft.cover) setCover(pendingDraft.cover)
    if (pendingDraft.content) setContent(pendingDraft.content)
    if (pendingDraft.seriesId) setSeriesId(pendingDraft.seriesId)
    setPendingDraft(null)
    toast.success('Draft restored from local backup.')
  }

  const handleDismissDraft = () => {
    clearDraft(draftKey)
    setPendingDraft(null)
  }

  const seriesOptionsQuery = useQuery({
    queryKey: ['my-series-options', session?.user?.id],
    queryFn: () => fetchAuthorSeriesOptions(session.user.id),
    enabled: !!session?.user?.id,
  })
  const seriesOptions = seriesOptionsQuery.data || []

  useEffect(() => {
    if (!authLoading && !session) {
      window.location.replace('/library')
    }
  }, [session, authLoading])

  const mutation = useMutation({
    mutationFn: async ({ title, lede, cover, content }) => {
      if (bookId) {
        // Edit Mode: UPDATE story & increment version
        const { data, error: updateErr } = await supabase
          .from('books')
          .update({
            title: title.trim(),
            lede: lede.trim(),
            cover,
            content: content.trim(),
            version: currentVersion + 1,
          })
          .eq('id', bookId)
          .eq('author_id', session.user.id)
          .select('id')
          .single()

        if (updateErr) throw updateErr
        return data
      } else {
        // Publish Mode: INSERT story
        const { data, error: bookError } = await supabase
          .from('books')
          .insert({
            title: title.trim(),
            lede: lede.trim(),
            cover,
            content: content.trim(),
            author_id: session.user.id,
            version: 1,
          })
          .select('id')
          .single()

        if (bookError) throw bookError
        return data
      }
    },
    onSuccess: async (data) => {
      clearDraft(draftKey)
      queryClient.invalidateQueries({ queryKey: ['books'] })
      queryClient.invalidateQueries({ queryKey: ['book', bookId] })

      if (data?.id) {
        supabase.functions.invoke('moderate-content', {
          body: { targetType: 'story', targetId: data.id },
        }).catch(console.error)
      }

      let seriesAttachFailed = false
      if (seriesId && data?.id) {
        try {
          await addBookToSeries({ seriesId, bookId: data.id })
        } catch (err) {
          console.error('Failed to attach story to series:', err)
          seriesAttachFailed = true
          toast.error('Story saved, but attaching it to series failed.')
        }
      }

      const destination = data?.id ? `/library/read/${data.id}` : '/library'
      toast.success(bookId ? 'Story updated successfully!' : 'Story published!')
      if (seriesAttachFailed) {
        setTimeout(() => window.location.replace(destination), 1800)
      } else {
        window.location.replace(destination)
      }
    },
    onError: (err) => {
      setError(err.message || 'Failed to save story.')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)

    if (!title.trim() || !lede.trim() || !content.trim()) {
      setError('Title, lede, and content are required.')
      return
    }

    const validation = validateStoryContent(content)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    mutation.mutate({ title, lede, cover, content })
  }

  const isSubmitting = mutation.isPending
  const wc = countWords(content)
  const readMins = wc > 0 ? Math.ceil(wc / 200) : null

  if (authLoading || !session || fetchingBook) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh]">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">
        {fetchingBook ? 'Loading story details…' : 'Verifying soul…'}
      </p>
    </div>
  )

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      {/* Draft Backup Restore Banner */}
      {pendingDraft && (
        <div className="card-raised p-4 mb-6 border border-[var(--color-ember)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="font-mono text-xs font-bold uppercase text-[var(--color-ember)]">⚠️ Unsaved Draft Found</span>
            <p className="font-mono text-xs text-[var(--color-ash)] mt-0.5">
              Saved locally on {new Date(pendingDraft.savedAt).toLocaleTimeString()}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="btn-vhs"
            >
              Restore Draft
            </button>
            <button
              type="button"
              onClick={handleDismissDraft}
              className="px-3 py-1 font-mono text-xs uppercase border border-[var(--color-line)] text-[var(--color-ash)] hover:border-white"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ash)] mb-2">The Library</span>
      <h2 className="title text-3xl font-serif font-black mb-8">
        {bookId ? 'Revise ' : 'Publish '}
        <em className="italic text-[var(--color-blood)] font-serif">
          {bookId ? 'story' : 'a story'}
        </em>
        {bookId && <span className="text-xs font-mono font-normal ml-3 text-[var(--color-ash)]">(v{currentVersion})</span>}
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-ash)] uppercase">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="The Tell-Tale Heart"
            className="bg-[var(--color-void)] text-[var(--color-bone)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-ember)] outline-none font-mono"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-ash)] uppercase">Lede / Pitch</label>
          <input
            value={lede}
            onChange={(e) => setLede(e.target.value)}
            required
            placeholder="A short hook to draw readers in…"
            className="bg-[var(--color-void)] text-[var(--color-bone)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-ember)] outline-none font-mono"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-ash)] uppercase">Cover Style</label>
          <div className="flex gap-4 flex-wrap">
            {COVER_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 cursor-pointer px-4 py-2 border transition-all ${cover === opt.value ? 'border-white bg-white/5' : 'border-[var(--color-line)]'}`}
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
          <label className="text-xs font-mono text-[var(--color-ash)] uppercase">Part of a series?</label>
          <select
            value={seriesId}
            onChange={(e) => setSeriesId(e.target.value)}
            className="bg-[var(--color-void)] text-[var(--color-bone)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-ember)] outline-none font-mono"
          >
            <option value="">None</option>
            {seriesOptions.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>

        {/* Content Section with Live Preview Tab */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-3">
              <label className="text-xs font-mono text-[var(--color-ash)] uppercase">Story Content</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('write')}
                  className={`font-mono text-xs uppercase px-2 py-0.5 border ${activeTab === 'write' ? 'bg-[var(--color-blood)] text-white border-[var(--color-blood)]' : 'border-[var(--color-line)] text-[var(--color-ash)]'}`}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`font-mono text-xs uppercase px-2 py-0.5 border ${activeTab === 'preview' ? 'bg-[var(--color-blood)] text-white border-[var(--color-blood)]' : 'border-[var(--color-line)] text-[var(--color-ash)]'}`}
                >
                  Preview
                </button>
              </div>
            </div>

            {wc > 0 && (
              <span className={`font-mono text-xs tracking-wider ${wc < 50 || wc > 10000 ? 'text-[var(--color-ember)]' : 'text-[var(--color-ash)]'}`}>
                {wc.toLocaleString()} words{readMins ? ` · ~${readMins} min read` : ''}
              </span>
            )}
          </div>

          {activeTab === 'write' ? (
            <>
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
            </>
          ) : (
            <div className="card-surface p-6 min-h-[300px] border border-[var(--color-line)] font-serif leading-relaxed text-[var(--color-bone)] space-y-4">
              {content.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <p className="font-mono text-xs italic text-[var(--color-ash)]">Nothing to preview yet…</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 mt-4 border-t border-[var(--color-line)] pt-6">
          <button 
            type="submit" 
            className="btn-vhs disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? (bookId ? 'Updating…' : 'Publishing…') : (bookId ? 'Save Revisions' : 'Publish Story')}
          </button>
          <button 
            type="button" 
            className="border border-[var(--color-line)] hover:border-white text-[var(--color-bone)] font-mono text-xs uppercase px-4 py-3 transition-colors cursor-pointer"
            onClick={() => window.location.replace(bookId ? `/library/read/${bookId}` : '/library')} 
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

function PublishStoryWithAuth(props) {
  return (
    <RequireAuth>
      <PublishStory {...props} />
    </RequireAuth>
  )
}

export default withProviders(PublishStoryWithAuth)
