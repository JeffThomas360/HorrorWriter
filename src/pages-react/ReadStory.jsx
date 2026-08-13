import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../components/AuthContext'
import ReportModal from '../components/ReportModal'
import { withProviders } from '../components/Providers'
import InlineModControls from '../components/mod/InlineModControls'
import MarkdownEditor from '../components/MarkdownEditor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ShareBar from '../components/ShareBar'
import QuoteSharer from '../components/QuoteSharer'
import { fetchStorySeriesContext } from '../lib/series'
import SeriesContextBar from '../components/SeriesContextBar'
import SeriesSidebar from '../components/SeriesSidebar'

const AV_COLORS = ['', 'av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

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
  if (!text) return null
  const words = text.trim().split(/\s+/).length
  const mins = Math.ceil(words / 200)
  return mins === 1 ? '~1 min read' : `~${mins} min read`
}

function ReadStory({ id }) {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  const [commentContent, setCommentContent] = useState('')
  const [commentError, setCommentError] = useState(null)
  const [reportTarget, setReportTarget] = useState(null)
  const [seriesContext, setSeriesContext] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadSeriesContext() {
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

  const { data: book, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['book', id],
    queryFn: async () => {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('books')
        .select('*, profiles(handle)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    }
  })

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ['book_comments', id],
    queryFn: async () => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('book_comments')
        .select('*, profiles(handle)')
        .eq('book_id', id)
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
          book_id: id,
          author_id: session.user.id,
          content: content.trim()
        })
        .select('*, profiles(handle)')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      setCommentContent('')
      queryClient.invalidateQueries({ queryKey: ['book_comments', id] })
      queryClient.invalidateQueries({ queryKey: ['book', id] })
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
    onError: (err) => {
      setCommentError(err.message || 'Failed to post critique.')
    }
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

  const error = queryError ? 'Story not found in the archives.' : null

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh]">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Opening dusty pages…</p>
    </div>
  )
  if (error) return (
    <div className="vintage-card text-center py-12 border-red-950">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-accent-crimson)] mb-4">Not found</p>
      <p className="font-serif italic text-sm text-[var(--color-text-secondary)] mb-6">{error}</p>
      <a href="/library" className="border border-[#2d2d2a] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors">Back to Library</a>
    </div>
  )

  const isSubmitting = commentMutation.isPending
  const rtLabel = readingTime(book?.content)

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
          <QuoteSharer title={book?.title} />

          {/* Title & Author Info */}
          <div className="border-b border-[#2d2d2a] pb-8 mb-12 text-center">
        <div className="flex justify-center items-center gap-4 text-xs font-mono text-[var(--color-text-secondary)] mb-4">
          <span>A story by @{book?.profiles?.handle || 'unknown'}</span>
          <button 
            onClick={() => setReportTarget({ type: 'story', id: book.id })} 
            className="text-xs uppercase border border-[#2d2d2a] hover:border-red-950 px-2 py-0.5 text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
          >
            Report
          </button>
          {book && <InlineModControls targetType="story" targetId={book.id} currentStatus={book.mod_status} authorId={book.author_id} />}
        </div>
        <h1 className="title text-3xl md:text-5xl font-serif font-black uppercase tracking-tight text-[var(--color-text-primary)] mb-6 max-w-3xl mx-auto leading-tight">
          {book?.title}
        </h1>
        {book?.lede && (
          <p className="text-base font-serif italic text-[var(--color-text-secondary)] max-w-xl mx-auto mb-6 leading-relaxed">
            {book.lede}
          </p>
        )}
        {rtLabel && (
          <span className="font-mono text-xs uppercase border border-[#2d2d2a] text-[var(--color-text-secondary)] px-2.5 py-1">
            {rtLabel}
          </span>
        )}
      </div>

      {/* Story Content Block (Restricted Line Width) */}
      <article className="prose-book prose prose-invert font-serif leading-relaxed text-[var(--color-text-primary)] mb-12">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{book?.content || ''}</ReactMarkdown>
      </article>

      {/* Share Bar */}
      <div className="max-w-2xl mx-auto border-t border-[#2d2d2a] pt-8">
        <ShareBar title={book?.title} />
      </div>

      {/* Critiques Section */}
      <div className="max-w-2xl mx-auto border-t border-[#2d2d2a] pt-12 mt-16">
        <h3 className="font-serif font-black text-xl text-[var(--color-text-primary)] mb-8 uppercase tracking-wide">
          Critiques &amp; Responses <span className="font-mono text-sm text-[var(--color-text-secondary)] font-normal ml-1">({comments.length})</span>
        </h3>

        {commentsLoading ? (
          <p className="font-mono text-xs uppercase text-[var(--color-text-secondary)] animate-pulse">Summoning critiques…</p>
        ) : comments.length === 0 ? (
          <p className="font-serif italic text-xs text-[var(--color-text-secondary)] py-8 border border-dashed border-[#2d2d2a] text-center">
            The void is quiet. Leave the first critique below.
          </p>
        ) : (
          <div className="flex flex-col gap-6 mb-12">
            {comments.map((c) => {
              const handle = c.profiles?.handle || 'unknown'
              const avColorIndex = (handle.length % 6) + 1
              return (
                <article key={c.id} className="vintage-card flex flex-col gap-4">
                  <div className="flex justify-between items-start border-b border-[#2d2d2a] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-bg-primary)] border border-[#2d2d2a] flex items-center justify-center font-mono text-xs text-[var(--color-text-secondary)]">
                        {initials(handle)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold text-[var(--color-text-primary)]">@{handle}</span>
                        <span className="font-mono text-xs text-[var(--color-text-secondary)]">{timeAgo(c.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex gap-3 items-center text-xs font-mono">
                      <button 
                        onClick={() => setReportTarget({ type: 'critique', id: c.id })} 
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
                      >
                        Report
                      </button>
                      <InlineModControls targetType="critique" targetId={c.id} currentStatus={c.mod_status} authorId={c.author_id} />
                    </div>
                  </div>
                  <div className="prose prose-invert font-serif text-sm leading-relaxed text-[var(--color-text-primary)]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.content}</ReactMarkdown>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* Comment Form */}
        {session ? (
          <form onSubmit={handleCommentSubmit} className="mt-8 border-t border-[#2d2d2a] pt-8">
            <h4 className="font-serif font-bold text-sm text-[var(--color-text-primary)] mb-4 uppercase tracking-wide">
              Leave a critique
            </h4>
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
              {commentError && <span className="form-err font-mono text-xs text-[var(--color-accent-crimson)]">{commentError}</span>}
            </div>
          </form>
        ) : (
          <div className="vintage-card text-center py-8">
            <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mb-4">You must enter the void to critique.</p>
            <button 
              className="font-mono text-xs uppercase border border-[#2d2d2a] hover:border-white px-4 py-2 transition-colors cursor-pointer"
              onClick={() => window.dispatchEvent(new CustomEvent('open-signin'))}
            >
              Sign In to Critique
            </button>
          </div>
        )}
      </div>

      <div className="text-center border-t border-[#2d2d2a] pt-8 mt-16 max-w-2xl mx-auto">
        <a href="/library" className="font-mono text-xs hover:text-[var(--color-accent-crimson)] transition-colors">← Return to the Library</a>
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
