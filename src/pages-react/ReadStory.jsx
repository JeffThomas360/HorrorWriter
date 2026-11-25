import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../components/AuthContext'
import ReportModal from '../components/ReportModal'
import CommunityGuidelines from '../components/CommunityGuidelines'
import BlockButton from '../components/BlockButton'
import FollowButton from '../components/FollowButton'
import AppealButton from '../components/AppealButton'
import CritiqueSignalBadge from '../components/CritiqueSignalBadge'
import { withProviders } from '../components/Providers'
import InlineModControls from '../components/mod/InlineModControls'
import MarkdownEditor from '../components/LazyMarkdownEditor'
import StoryMarkdown from '../components/StoryMarkdown'
import KindleReader, { useKindlePrefs } from '../components/KindleReader'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ShareBar from '../components/ShareBar'
import LoadError from '../components/LoadError'
import { isMissingRow } from '../lib/loadFailure'
import { fetchStorySeriesContext } from '../lib/series'
import SeriesContextBar from '../components/SeriesContextBar'
import SeriesSidebar from '../components/SeriesSidebar'
import { readMinutes } from '../lib/tapeWear'
import { isStoryOwner, copyrightNotice, authorLabel, isTombstone, TOMBSTONE_TEXT, isArchive, storyAuthorLabel, storyKeyColumn } from '../lib/storyHelpers'

const AV_COLORS = ['', 'av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

const CRITIQUE_FOCUS_LABELS = {
  hook: 'First 250 Words / Hook',
  atmosphere: 'Atmosphere & Dread',
  pacing: 'Pacing & Plot Twist',
  proofreading: 'Proofreading & Polish',
  readonly: 'Read Only / General Feedback',
}

function initials(handle) {
  if (!handle) return '??'
  return handle.split('-').map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

function timeAgo(dateString) {
  if (!dateString) return ''
  const d = new Date(dateString)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function readingTime(text) {
  const mins = readMinutes(text)
  if (mins == null) return null
  return mins === 1 ? '~1 min read' : `~${mins} min read`
}

function ReadStory({ id, initialBook }) {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  const [commentContent, setCommentContent] = useState('')
  const [commentError, setCommentError] = useState(null)
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [reportTarget, setReportTarget] = useState(null)
  const [seriesContext, setSeriesContext] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const kindle = useKindlePrefs()
  const [isKindleMode, setIsKindleMode] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadSeriesContext() {
      // Classics are addressed by slug and belong to no series.
      if (storyKeyColumn(id) !== 'id') return
      try {
        const context = await fetchStorySeriesContext(id)
        if (cancelled) return
        setSeriesContext(context)
        if (context) window.__seriesContext = context
      } catch {
        // Story simply renders without series chrome
      }
    }
    loadSeriesContext()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const { data: book, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['book', id],
    queryFn: async () => {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('books')
        .select('*, profiles(handle)')
        .eq(storyKeyColumn(id), id)
        .single()
      if (error) throw error
      return data
    },
    // Server-rendered first paint so the story text is in the HTML (SEO).
    initialData: initialBook ?? undefined,
  })

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    // Keyed on the row's uuid: a classic's URL key is its slug, which
    // book_comments.book_id (a uuid) can't match.
    queryKey: ['book_comments', book?.id],
    enabled: Boolean(book?.id),
    queryFn: async () => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('book_comments')
        .select('*, profiles(handle)')
        .eq('book_id', book.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    }
  })

  const commentMutation = useMutation({
    mutationFn: async (content) => {
      const { data, error } = await supabase
        .from('book_comments')
        .insert({
          book_id: book.id,
          author_id: session.user.id,
          content: content.trim()
        })
        .select('*, profiles(handle)')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (newComment) => {
      setCommentContent('')
      queryClient.invalidateQueries({ queryKey: ['book_comments', book?.id] })
      queryClient.invalidateQueries({ queryKey: ['book', id] })
      queryClient.invalidateQueries({ queryKey: ['books'] })
      if (newComment?.id) {
        supabase.functions.invoke('moderate-content', {
          body: { targetType: 'critique', targetId: newComment.id },
        }).catch(console.error)
      }
    },
    onError: (err) => {
      setCommentError(err.message || 'Failed to post critique.')
    }
  })

  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }) => {
      const { error } = await supabase
        .from('book_comments')
        .update({ content: content.trim(), updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .eq('author_id', session.user.id)
      if (error) throw error
    },
    onSuccess: () => {
      setEditingCommentId(null)
      setEditingCommentText('')
      queryClient.invalidateQueries({ queryKey: ['book_comments', book?.id] })
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId) => {
      const { error } = await supabase
        .from('book_comments')
        .delete()
        .eq('id', commentId)
        .eq('author_id', session.user.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['book_comments', book?.id] })
      queryClient.invalidateQueries({ queryKey: ['book', id] })
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
  })

  const handleCommentSubmit = (e) => {
    e.preventDefault()
    setCommentError(null)
    if (!commentContent.trim()) {
      setCommentError('Cannot speak nothingness.')
      return
    }
    commentMutation.mutate(commentContent)
  }

  // Only a definite "no such row" is Not found. A failed re-read keeps the
  // server-rendered story on screen; with nothing to show, offer a retry.
  const notFound = isMissingRow(queryError)
  const isOwner = isStoryOwner(session?.user?.id, book)

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh]">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Opening dusty pages…</p>
    </div>
  )
  if (notFound) return (
    <div className="vintage-card text-center py-12 border-red-950">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-accent-crimson)] mb-4">Not found</p>
      <p className="font-serif italic text-sm text-[var(--color-text-secondary)] mb-6">Story not found in the archives.</p>
      <a href="/library/" className="border border-[var(--color-line)] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors">Back to Library</a>
    </div>
  )
  if (!book) return (
    <LoadError
      title="The story didn't open"
      message="We couldn't load this story just now. Check your connection, then try again."
      error={queryError}
      onRetry={() => refetch()}
    />
  )

  const isSubmitting = commentMutation.isPending
  const rtLabel = readingTime(book?.content)
  const prevSeriesPart = seriesContext && seriesContext.currentIndex > 0
    ? seriesContext.allBooks[seriesContext.currentIndex - 1]
    : null
  const nextSeriesPart = seriesContext && seriesContext.currentIndex < seriesContext.allBooks.length - 1
    ? seriesContext.allBooks[seriesContext.currentIndex + 1]
    : null

  if (isKindleMode) {
    return (
      <KindleReader
        prefs={kindle}
        onExit={() => setIsKindleMode(false)}
        onNext={nextSeriesPart ? () => { window.location.href = `/library/read/${nextSeriesPart.id}/` } : undefined}
        nextLabel={nextSeriesPart ? `Next: Part ${seriesContext.currentIndex + 2} →` : undefined}
        hudTitle={isTombstone(book) ? TOMBSTONE_TEXT : book?.title}
        eyebrow={isTombstone(book) ? null : `A story by ${storyAuthorLabel(book)}`}
        title={isTombstone(book) ? TOMBSTONE_TEXT : book?.title}
        lede={isTombstone(book) ? null : book?.lede}
        endNote={isTombstone(book) ? null : <p className="mb-4 not-italic font-mono text-xs">{copyrightNotice(book)}</p>}
        exitLabel="Exit Focus Mode & Return to Discussions"
        footerLeft={storyAuthorLabel(book)}
        wordCount={book?.content?.trim().split(/\s+/).length || 0}
      >
        {isTombstone(book) ? null : <StoryMarkdown content={book?.content} />}
      </KindleReader>
    )
  }

  return (
    <>
      {seriesContext && (
        <>
          <SeriesContextBar
            seriesContext={seriesContext}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            isMobile={isMobile}
          />
          {!isMobile && <SeriesSidebar seriesContext={seriesContext} isOpen={true} onClose={() => {}} isMobile={false} />}
          {isMobile && <SeriesSidebar seriesContext={seriesContext} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isMobile={true} />}
        </>
      )}

      <div style={{
        marginTop: seriesContext ? '60px' : '0',
        marginRight: seriesContext && !isMobile ? '280px' : '0',
        maxWidth: '100%',
        boxSizing: 'border-box',
        paddingLeft: '1rem',
        paddingRight: '1rem'
      }}>
        <div className="mt-8">
          {isArchive(book) && (
            <div className="mb-8 p-4 border border-[var(--color-upside)]/50 bg-[var(--color-upside)]/10 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-2.5 text-[var(--color-upside)]">
                <span className="text-xl">📼</span>
                <div>
                  <strong className="tracking-wider uppercase">Public Domain Classic</strong>
                  <p className="text-[11px] text-[var(--color-text-secondary)] font-serif italic mt-0.5">
                    A public-domain horror masterwork, not a member submission. Critique it like any other story.
                  </p>
                </div>
              </div>
              <span className="shrink-0 px-2 py-0.5 border border-[var(--color-upside)] text-[10px] uppercase font-bold text-[var(--color-upside)]">
                Archive Tape
              </span>
            </div>
          )}

          {/* Title & Author Info */}
          <div className="border-b border-[var(--color-line)] pb-8 mb-12 text-center">
        <div className="flex justify-center items-center gap-4 flex-wrap text-xs font-mono text-[var(--color-text-secondary)] mb-4">
          <span>
            A story by{' '}
            {book?.profiles?.handle ? (
              <a
                href={`/u/${book.profiles.handle}/`}
                className="text-[var(--color-text-primary)] hover:text-[var(--color-ember)] underline transition-colors"
              >
                {storyAuthorLabel(book)}
              </a>
            ) : (
              storyAuthorLabel(book)
            )}
          </span>
          <button 
            onClick={() => setReportTarget({ type: 'story', id: book.id })} 
            className="text-xs uppercase border border-[var(--color-line)] hover:border-[var(--color-blood)] px-2 py-0.5 text-[var(--color-ash)] hover:text-[var(--color-blood)] cursor-pointer"
          >
            Report
          </button>
          {isOwner && (
            <a 
              href={`/library/edit/${book.id}/`}
              className="text-xs uppercase border border-[var(--color-line)] hover:border-[var(--color-bone)] px-2 py-0.5 text-[var(--color-ash)] hover:text-[var(--color-bone)] transition-colors"
            >
              Edit Story
            </a>
          )}
          {book && session?.user?.id && book.author_id && !isOwner && (
            <>
              <FollowButton targetProfileId={book.author_id} />
              <BlockButton targetUserId={book.author_id} targetHandle={book?.profiles?.handle} />
            </>
          )}
          {isOwner && book.mod_status !== 'live' && (
            <AppealButton modActionId={book.id} targetType="story" />
          )}
          {book && <InlineModControls targetType="story" targetId={book.id} currentStatus={book.mod_status} authorId={book.author_id} />}
        </div>
        <h1 className="title text-3xl md:text-5xl font-serif font-black uppercase tracking-tight text-[var(--color-text-primary)] mb-6 max-w-3xl mx-auto leading-tight">
          {isTombstone(book) ? TOMBSTONE_TEXT : book?.title}
        </h1>
        {!isTombstone(book) && book?.lede && (
          <p className="text-base font-serif italic text-[var(--color-text-secondary)] max-w-xl mx-auto mb-6 leading-relaxed">
            {book.lede}
          </p>
        )}
        <div className="flex gap-2 justify-center items-center flex-wrap mt-4">
          {(book?.badge || book?.is_example) && (
            <span className="font-mono text-xs uppercase font-bold bg-[var(--color-ember)] text-white px-2.5 py-1 shadow-sm">
              {book.badge || 'EXAMPLE STORY'}
            </span>
          )}
          {rtLabel && (
            <span className="font-mono text-xs uppercase border border-[var(--color-line)] text-[var(--color-text-secondary)] px-2.5 py-1">
              {rtLabel}
            </span>
          )}
        </div>
      </div>

      {/* Reading Typesetting & Layout Controls */}
      <div className="max-w-[44rem] mx-auto mb-8 flex flex-wrap items-center justify-between gap-3 border-y border-[var(--color-line)] py-2.5 font-mono text-xs text-[var(--color-text-secondary)] select-none">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setIsKindleMode(true)
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-[var(--color-blood)] hover:bg-[var(--color-blood)]/80 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
            title="Open full distraction-free Focus mode"
          >
            <span className="text-sm">⛶</span>
            <span>Focus Mode</span>
          </button>

          <span className="text-[var(--color-line)] hidden sm:inline">|</span>

          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">Format:</span>
          <button
            type="button"
            onClick={() => kindle.setFormat('modern')}
            className={`px-2 py-0.5 border text-xs cursor-pointer transition-colors ${
              kindle.format === 'modern'
                ? 'bg-[var(--color-blood)] text-white border-[var(--color-blood)]'
                : 'border-[var(--color-line)] hover:border-white text-[var(--color-text-primary)]'
            }`}
          >
            ¶ Modern
          </button>
          <button
            type="button"
            onClick={() => kindle.setFormat('novel')}
            className={`px-2 py-0.5 border text-xs cursor-pointer transition-colors ${
              kindle.format === 'novel'
                ? 'bg-[var(--color-blood)] text-white border-[var(--color-blood)]'
                : 'border-[var(--color-line)] hover:border-white text-[var(--color-text-primary)]'
            }`}
          >
            📖 Novel
          </button>
        </div>

        {/* Size Quick Toggle */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mr-0.5">Size:</span>
          {[16, 18, 20, 22].map((sz, idx) => {
            const labels = ['A-', 'A', 'A+', 'A++']
            return (
              <button
                key={sz}
                type="button"
                onClick={() => kindle.update('size', sz)}
                className={`px-1.5 py-0.5 border cursor-pointer font-serif text-xs ${
                  kindle.size === sz
                    ? 'border-[var(--color-ember)] text-[var(--color-ember)] font-bold'
                    : 'border-[var(--color-line)] hover:border-white'
                }`}
                title={`${sz}px font size`}
              >
                {labels[idx]}
              </button>
            )
          })}
        </div>
      </div>

      {!isTombstone(book) && (
        <>
          {/* Story Content Block */}
          <article
            className={`prose-book prose prose-invert font-serif leading-relaxed text-[var(--color-text-primary)] mb-12 kindle-font-${kindle.font} kindle-leading-${kindle.spacing} ${
              kindle.format === 'novel' ? 'format-novel' : ''
            }`}
            style={{ fontSize: `${kindle.size}px` }}
          >
            <StoryMarkdown content={book?.content} />
          </article>

          {/* Inline Series Part Navigation at the end of the story */}
          {seriesContext && (prevSeriesPart || nextSeriesPart) && (
            <nav
              aria-label="Series part navigation"
              className="max-w-2xl mx-auto mb-10 p-4 border border-[var(--color-line)] bg-[var(--color-surface)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-mono text-xs"
            >
              {prevSeriesPart ? (
                <a
                  href={`/library/read/${prevSeriesPart.id}/`}
                  className="border border-[var(--color-line)] hover:border-white px-3.5 py-2 text-[var(--color-bone)] transition-colors truncate"
                >
                  ← Part {seriesContext.currentIndex}: {prevSeriesPart.title}
                </a>
              ) : <span />}
              {nextSeriesPart && (
                <a
                  href={`/library/read/${nextSeriesPart.id}/`}
                  className="border border-[var(--color-upside)] text-[var(--color-upside)] hover:bg-[var(--color-upside)] hover:text-[var(--color-void)] px-4 py-2 font-bold uppercase tracking-wider transition-colors text-right truncate"
                >
                  Next in Series · Part {seriesContext.currentIndex + 2}: {nextSeriesPart.title} →
                </a>
              )}
            </nav>
          )}

          {/* Authors keep all rights (House Rules, rule 1); archive classics say public domain. */}
          <p className="max-w-2xl mx-auto mb-8 text-center font-mono text-xs text-[var(--color-text-secondary)]">
            {copyrightNotice(book)}{' '}
            {!isArchive(book) && (
              <a href="/rules/#house-rules" className="underline hover:text-[var(--color-ember)]">Creator ownership</a>
            )}
          </p>

          {/* Share Bar */}
          <div className="max-w-2xl mx-auto border-t border-[var(--color-line)] pt-8">
            <ShareBar />
          </div>
        </>
      )}

      {/* Critiques Section */}
      <div className="max-w-2xl mx-auto border-t border-[var(--color-line)] pt-12 mt-16">
        <h3 className="font-serif font-black text-xl text-[var(--color-text-primary)] mb-8 uppercase tracking-wide">
          Critiques &amp; Responses <span className="font-mono text-sm text-[var(--color-text-secondary)] font-normal ml-1">({comments.length})</span>
        </h3>

        {book?.critique_focus && (
          <div
            data-testid="author-critique-focus"
            className="mb-6 p-3.5 border border-[var(--color-upside)]/40 bg-[var(--color-upside)]/5 font-mono text-xs flex flex-wrap items-center justify-between gap-2"
          >
            <span className="uppercase tracking-wider text-[var(--color-upside)]">
              ✦ Author’s Critique Focus:
            </span>
            <span className="text-[var(--color-bone)] font-bold">
              {CRITIQUE_FOCUS_LABELS[book.critique_focus] || book.critique_focus}
            </span>
          </div>
        )}

        {commentsLoading ? (
          <p className="font-mono text-xs uppercase text-[var(--color-text-secondary)] animate-pulse">Summoning critiques…</p>
        ) : comments.length === 0 ? (
          <p className="font-serif italic text-xs text-[var(--color-text-secondary)] py-8 border border-dashed border-[var(--color-line)] text-center">
            The void is quiet. Leave the first critique below.
          </p>
        ) : (
          <div className="flex flex-col gap-6 mb-12">
            {comments.map((c) => {
              const handle = c.profiles?.handle || 'unknown'
              const avColorIndex = (handle.length % 6) + 1
              return (
                <article key={c.id} className="vintage-card flex flex-col gap-4">
                  <div className="flex justify-between items-start border-b border-[var(--color-line)] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-bg-primary)] border border-[var(--color-line)] flex items-center justify-center font-mono text-xs text-[var(--color-text-secondary)]">
                        {initials(handle)}
                      </div>
                      <div className="flex flex-col">
                        {c.profiles?.handle ? (
                          <a
                            href={`/u/${c.profiles.handle}/`}
                            className="font-mono text-xs font-bold text-[var(--color-text-primary)] hover:text-[var(--color-ember)] hover:underline"
                          >
                            {authorLabel(c.profiles)}
                          </a>
                        ) : (
                          <span className="font-mono text-xs font-bold text-[var(--color-text-primary)]">{authorLabel(c.profiles)}</span>
                        )}
                        <span className="font-mono text-xs text-[var(--color-text-secondary)]">{timeAgo(c.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex gap-3 items-center text-xs font-mono flex-wrap">
                      <CritiqueSignalBadge currentBookVersion={book?.version || 1} commentBookVersion={c.book_version || 1} />
                      {session?.user?.id && c.author_id === session.user.id && editingCommentId !== c.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.content || '') }}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-bone)] cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Delete this critique forever?')) {
                                deleteCommentMutation.mutate(c.id)
                              }
                            }}
                            disabled={deleteCommentMutation.isPending}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-ember)] cursor-pointer"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => setReportTarget({ type: 'critique', id: c.id })} 
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
                      >
                        Report
                      </button>
                      <InlineModControls targetType="critique" targetId={c.id} currentStatus={c.mod_status} authorId={c.author_id} />
                    </div>
                  </div>
                  {editingCommentId === c.id ? (
                    <div className="flex flex-col gap-3">
                      <textarea
                        value={editingCommentText}
                        onChange={(e) => setEditingCommentText(e.target.value)}
                        rows={4}
                        aria-label="Edit critique"
                        className="w-full bg-[var(--color-void)] text-[var(--color-bone)] border border-[var(--color-line)] p-3 text-sm font-serif focus:border-[var(--color-blood)] outline-none"
                      />
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <button
                          type="button"
                          disabled={!editingCommentText.trim() || updateCommentMutation.isPending}
                          onClick={() => updateCommentMutation.mutate({ commentId: c.id, content: editingCommentText })}
                          className="bg-[var(--color-blood)] text-white uppercase px-3 py-1.5 hover:bg-red-700 cursor-pointer disabled:opacity-50"
                        >
                          {updateCommentMutation.isPending ? 'Saving…' : 'Save Critique'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingCommentId(null); setEditingCommentText('') }}
                          className="border border-[var(--color-line)] hover:border-white uppercase px-3 py-1.5 text-[var(--color-ash)] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-invert font-serif text-sm leading-relaxed text-[var(--color-text-primary)]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.content}</ReactMarkdown>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}

        {/* Comment Form */}
        {session ? (
          <form onSubmit={handleCommentSubmit} className="mt-8 border-t border-[var(--color-line)] pt-8">
            <h4 className="font-serif font-bold text-sm text-[var(--color-text-primary)] mb-4 uppercase tracking-wide">
              Leave a critique
            </h4>
            <CommunityGuidelines />
            <div className="mb-4">
              <MarkdownEditor
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder="Offer constructive dark wisdom…"
                rows={5}
                disabled={isSubmitting}
              />
            </div>
            <div className="flex items-center gap-4">
              <button 
                type="submit" 
                className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-5 py-3 hover:bg-red-700 transition-colors cursor-pointer"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Summoning…' : 'Post Critique'}
              </button>
              {commentError && <span className="form-err font-mono text-xs text-[var(--color-ember)]">{commentError}</span>}
            </div>
          </form>
        ) : (
          <div className="vintage-card text-center py-8">
            <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mb-4">You must enter the void to critique.</p>
            <button 
              className="font-mono text-xs uppercase border border-[var(--color-line)] hover:border-white px-4 py-2 transition-colors cursor-pointer"
              onClick={() => window.dispatchEvent(new CustomEvent('open-signin'))}
            >
              Sign In to Critique
            </button>
          </div>
        )}
      </div>

      <div className="text-center border-t border-[var(--color-line)] pt-8 mt-16 max-w-2xl mx-auto">
        <a href="/library/" className="font-mono text-xs hover:text-[var(--color-accent-crimson)] transition-colors">← Return to the Library</a>
      </div>

          <ReportModal
            isOpen={!!reportTarget}
            onClose={() => setReportTarget(null)}
            targetType={reportTarget?.type}
            targetId={reportTarget?.id}
          />
        </div>
      </div>
    </>
  )
}

export default withProviders(ReadStory)
