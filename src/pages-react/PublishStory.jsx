import { useState, useEffect } from 'react'
import { toast } from '../lib/notify'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../supabaseClient'
import { screenContent } from '../lib/screenContent'
import { useAuth } from '../components/AuthContext'
import MarkdownEditor from '../components/MarkdownEditor'
import StoryCardPreview from '../components/StoryCardPreview'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { fetchAuthorSeriesOptions, applySeriesChoice } from '../lib/series'
import { validateStoryContent, countWords } from '../lib/storyValidation'
import { readMinutes } from '../lib/tapeWear'
import { saveDraft, getDraft, clearDraft } from '../lib/draftAutosave'
import TranscribeButton from '../components/TranscribeButton'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'

export const CRITIQUE_TAGS = [
  { id: 'hook', label: 'First 250 Words / Hook' },
  { id: 'atmosphere', label: 'Atmosphere & Dread' },
  { id: 'pacing', label: 'Pacing & Plot Twist' },
  { id: 'proofreading', label: 'Proofreading & Polish' },
  { id: 'readonly', label: 'Read Only / General Feedback' },
]

function PublishStory({ bookId }) {
  const { session, profile, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [lede, setLede] = useState('')
  const [cover, setCover] = useState('blood')
  const [critiqueFocus, setCritiqueFocus] = useState('')
  const [content, setContent] = useState(() => {
    if (!bookId && typeof window !== 'undefined') {
      const seed = new URLSearchParams(window.location.search).get('seed')
      if (seed && seed.trim()) return `> "${seed.trim()}"\n\n`
    }
    return ''
  })
  const [error, setError] = useState(null)
  // House Rule 4. Asked afresh every time, edits included, and never saved with the
  // draft: it is a promise about what is being sent now.
  const [wroteIt, setWroteIt] = useState(false)
  const [seriesId, setSeriesId] = useState('')
  const [activeTab, setActiveTab] = useState('write') // 'write' | 'preview'
  const [currentVersion, setCurrentVersion] = useState(1)
  const [fetchingBook, setFetchingBook] = useState(Boolean(bookId))
  // Edit mode: what the preview card needs from the saved story.
  const [existing, setExisting] = useState(null)

  const [pendingDraft, setPendingDraft] = useState(null)

  const draftKey = bookId ? `edit_${bookId}` : 'new_story'

  // Fetch author's series options
  const { data: seriesOptions = [] } = useQuery({
    queryKey: ['authorSeries', session?.user?.id],
    queryFn: () => fetchAuthorSeriesOptions(session.user.id),
    enabled: Boolean(session?.user?.id),
  })

  // Fetch story details if in Edit Mode (bookId). Keyed on the user id, not
  // the session object: AuthContext replaces session on every token refresh,
  // and reloading here would overwrite the author's unsaved edits.
  const userId = session?.user?.id
  useEffect(() => {
    if (!bookId || !userId) return
    let isMounted = true
    setFetchingBook(true)

    const loadBook = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('books')
          .select('*, series_books(series_id, sort_order)')
          .eq('id', bookId)
          .single()

        if (fetchErr) throw fetchErr
        if (!data) throw new Error('Story not found.')

        if (isMounted) {
          const link = Array.isArray(data.series_books) && data.series_books.length > 0 ? data.series_books[0] : null
          const loadedTitle = data.title || ''
          const loadedLede = data.lede || ''
          const loadedCover = data.cover || 'blood'
          const loadedContent = data.content || ''
          const loadedSeriesId = link?.series_id || ''
          const loadedCritiqueFocus = data.critique_focus || ''
          setTitle(loadedTitle)
          setLede(loadedLede)
          setCover(loadedCover)
          setContent(loadedContent)
          setCritiqueFocus(loadedCritiqueFocus)
          setCurrentVersion(data.version || 1)
          if (link) setSeriesId(loadedSeriesId)
          setExisting({
            title: loadedTitle,
            lede: loadedLede,
            cover: loadedCover,
            content: loadedContent,
            critiqueFocus: loadedCritiqueFocus,
            createdAt: data.created_at,
            critiqueCount: data.comments_count || 0,
            seriesId: link?.series_id || null,
            sortOrder: link?.sort_order ?? 0,
          })
          // If an earlier visit left a local draft identical to the saved story, clear it
          // so the author isn't prompted to restore an unchanged snapshot.
          const saved = getDraft(`edit_${bookId}`)
          if (
            saved &&
            (saved.title || '') === loadedTitle &&
            (saved.lede || '') === loadedLede &&
            (saved.cover || 'blood') === loadedCover &&
            (saved.content || '') === loadedContent &&
            (saved.seriesId || '') === loadedSeriesId
          ) {
            clearDraft(`edit_${bookId}`)
            setPendingDraft(null)
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
  }, [bookId, userId])

  // Check for unsaved draft in localStorage
  useEffect(() => {
    const saved = getDraft(draftKey)
    if (saved && (saved.title || saved.content)) {
      setPendingDraft(saved)
    }
  }, [draftKey])

  // Auto-save draft on typing (debounced 1.5s)
  useEffect(() => {
    if (authLoading || fetchingBook) return
    if (!title && !lede && !content) return
    // In edit mode, wait until existing story is loaded and only autosave when
    // the form state actually differs from the saved story.
    if (bookId) {
      if (!existing) return
      const unchanged =
        title === existing.title &&
        lede === existing.lede &&
        cover === existing.cover &&
        content === existing.content &&
        (seriesId || '') === (existing.seriesId || '')
      if (unchanged) return
    }

    const timer = setTimeout(() => {
      saveDraft(draftKey, { title, lede, cover, content, seriesId })
    }, 1500)

    return () => clearTimeout(timer)
  }, [title, lede, cover, content, seriesId, draftKey, authLoading, fetchingBook, bookId, existing])

  const handleRestoreDraft = () => {
    if (!pendingDraft) return
    if (pendingDraft.title) setTitle(pendingDraft.title)
    if (pendingDraft.lede) setLede(pendingDraft.lede)
    if (pendingDraft.cover) setCover(pendingDraft.cover)
    if (pendingDraft.content) setContent(pendingDraft.content)
    if (pendingDraft.seriesId) setSeriesId(pendingDraft.seriesId)
    setPendingDraft(null)
    toast.success('Draft restored from local memory.')
  }

  const handleDismissDraft = () => {
    clearDraft(draftKey)
    setPendingDraft(null)
  }

  const mutation = useMutation({
    mutationFn: async ({ title, lede, cover, content, critiqueFocus: focus }) => {
      if (bookId) {
        // Edit Mode: UPDATE story with version increment
        const updatePayload = {
          title: title.trim(),
          lede: lede.trim(),
          cover,
          content: content.trim(),
          version: currentVersion + 1,
          updated_at: new Date().toISOString(),
          ...(focus || existing?.critiqueFocus ? { critique_focus: focus || null } : {}),
        }
        const { data, error: updateErr } = await supabase
          .from('books')
          .update(updatePayload)
          .eq('id', bookId)
          .eq('author_id', session.user.id)
          .select('id')
          .single()

        if (updateErr) throw updateErr
        return data
      } else {
        // Publish Mode: INSERT story
        const insertPayload = {
          title: title.trim(),
          lede: lede.trim(),
          cover,
          content: content.trim(),
          author_id: session.user.id,
          version: 1,
          ...(focus ? { critique_focus: focus } : {}),
        }
        const { data, error: bookError } = await supabase
          .from('books')
          .insert(insertPayload)
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

      await screenContent(supabase, 'story', data?.id)

      // Editing a story already in its series must not add it again (that
      // fails on the primary key); a changed choice leaves the old series first.
      let seriesAttachFailed = false
      if (data?.id) {
        try {
          await applySeriesChoice({ bookId: data.id, previousSeriesId: existing?.seriesId, chosenSeriesId: seriesId })
        } catch (err) {
          console.error('Failed to update the story\'s series:', err)
          seriesAttachFailed = true
          toast.error('Story saved, but its series could not be updated.')
        }
      }

      const destination = data?.id ? `/library/read/${data.id}/` : '/library/'
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

    if (!wroteIt) {
      setError('Tick the box to confirm you wrote this story yourself.')
      return
    }

    mutation.mutate({ title, lede, cover, content, critiqueFocus })
  }

  const isSubmitting = mutation.isPending
  const wc = countWords(content)
  const readMins = readMinutes(content)
  // The card's Vol sticker: the story's saved place if it stays in its series,
  // otherwise the next place in the chosen series (positions are 0-based).
  const chosenSeries = seriesOptions.find((s) => s.id === seriesId)
  const previewSeries = chosenSeries
    ? {
        id: chosenSeries.id,
        title: chosenSeries.title,
        position: existing?.seriesId === chosenSeries.id ? existing.sortOrder : (chosenSeries.bookCount ?? 0),
      }
    : null

  if (authLoading || !session || fetchingBook) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh]">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">
        {fetchingBook ? 'Loading story details…' : 'Verifying soul…'}
      </p>
    </div>
  )

  return (
    <div className="mt-8 max-w-6xl mx-auto">
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
              className="px-3 py-1 font-mono text-xs uppercase border border-[var(--color-line)] text-[var(--color-ash)] hover:border-white cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="border-b border-[var(--color-line)] pb-6 mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ash)] mb-2">The Library</span>
          <h2 className="title text-3xl font-serif font-black">
            {bookId ? 'Revise ' : 'Publish '}
            <em className="italic text-[var(--color-blood)] font-serif">
              {bookId ? 'story' : 'a story'}
            </em>
            {bookId && <span className="text-xs font-mono font-normal ml-3 text-[var(--color-ash)]">(v{currentVersion})</span>}
          </h2>
        </div>
        <div className="font-mono text-xs text-[var(--color-text-secondary)] uppercase">
          Tactile Studio • Sensory Enabled
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form & Editor (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[var(--color-ash)] uppercase">Story Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="The Music of Erich Zann"
                className="bg-[var(--color-void)] text-[var(--color-bone)] border border-[var(--color-line)] px-3.5 py-2.5 text-sm focus:border-[var(--color-blood)] outline-none font-mono"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[var(--color-ash)] uppercase">Lede / Back-Cover Hook</label>
              <input
                value={lede}
                onChange={(e) => setLede(e.target.value)}
                required
                placeholder="In the Rue d'Auseil, the old man played melodies that held back the abyss..."
                className="bg-[var(--color-void)] text-[var(--color-bone)] border border-[var(--color-line)] px-3.5 py-2.5 text-sm focus:border-[var(--color-blood)] outline-none font-mono"
              />
            </div>

            {/* Critique Feedback Wanted */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[var(--color-ash)] uppercase">
                What feedback do you want from other writers?
              </label>
              <div className="flex flex-wrap gap-2">
                {CRITIQUE_TAGS.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setCritiqueFocus((prev) => (prev === tag.id ? '' : tag.id))}
                    className={`font-mono text-xs px-2.5 py-1 border transition-colors cursor-pointer ${
                      critiqueFocus === tag.id
                        ? 'bg-[var(--color-blood)] text-white border-[var(--color-blood)]'
                        : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-line)] hover:border-white'
                    }`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="story-series" className="text-xs font-mono text-[var(--color-ash)] uppercase">Part of a series?</label>
              <select
                id="story-series"
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value)}
                className="bg-[var(--color-void)] text-[var(--color-bone)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-blood)] outline-none font-mono cursor-pointer"
              >
                <option value="">None (Standalone Tape)</option>
                {seriesOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>

            {/* Content Section with Sensory MarkdownEditor */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-mono text-[var(--color-ash)] uppercase">Story Manuscript</label>
                {wc > 0 && (
                  <span className={`font-mono text-xs tracking-wider ${wc < 50 || wc > 10000 ? 'text-[var(--color-ember)]' : 'text-[var(--color-ash)]'}`}>
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

            <div className="flex flex-wrap items-center gap-x-3 mt-4 border-t border-[var(--color-line)] pt-4">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--color-bone)]">
                <input
                  type="checkbox"
                  required
                  checked={wroteIt}
                  onChange={(e) => setWroteIt(e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-[var(--color-ember)]"
                />
                I wrote this myself. No AI wrote it for me.
              </label>
              <a
                href="/rules/#house-rules"
                target="_blank"
                rel="noopener"
                className="font-mono text-xs uppercase tracking-wider text-[var(--color-ash)] underline underline-offset-2 hover:text-[var(--color-ember)]"
              >
                House Rule 4
              </a>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                className="btn-vhs disabled:opacity-50 cursor-pointer"
                disabled={isSubmitting}
              >
                {isSubmitting ? (bookId ? 'Updating…' : 'Publishing Tape…') : (bookId ? 'Save Revisions' : 'Publish Story to Archives')}
              </button>
              <button 
                type="button" 
                className="border border-[var(--color-line)] hover:border-white text-[var(--color-bone)] font-mono text-xs uppercase px-4 py-3 transition-colors cursor-pointer"
                onClick={() => {
                  if (bookId) clearDraft(draftKey)
                  window.location.replace(bookId ? `/library/read/${bookId}/` : '/library/')
                }} 
                disabled={isSubmitting}
              >
                Cancel
              </button>
              {error && <span className="form-err font-mono text-xs text-[var(--color-ember)]">{error}</span>}
            </div>
          </form>
        </div>

        {/* Right Column: the real Library card, live from the form (5 cols) */}
        <div className="lg:col-span-5">
          <div className="sticky top-6">
            <StoryCardPreview
              storyId={bookId}
              createdAt={existing?.createdAt}
              critiqueCount={existing?.critiqueCount}
              title={title}
              lede={lede}
              content={content}
              cover={cover}
              handle={profile?.handle}
              series={previewSeries}
              onCoverChange={setCover}
            />
          </div>
        </div>
      </div>
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
