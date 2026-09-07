import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../components/AuthContext'
import ReportModal from '../components/ReportModal'
import CommunityGuidelines from '../components/CommunityGuidelines'
import BlockButton from '../components/BlockButton'
import AppealButton from '../components/AppealButton'
import CritiqueSignalBadge from '../components/CritiqueSignalBadge'
import { withProviders } from '../components/Providers'
import InlineModControls from '../components/mod/InlineModControls'
import MarkdownEditor from '../components/MarkdownEditor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'
import ShareBar from '../components/ShareBar'
import QuoteSharer from '../components/QuoteSharer'
import { fetchStorySeriesContext } from '../lib/series'
import SeriesContextBar from '../components/SeriesContextBar'
import SeriesSidebar from '../components/SeriesSidebar'
import { ARCHIVE_STORIES } from '../lib/seedArchives'

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
  const [formatMode, setFormatMode] = useState('modern')
  const [isKindleMode, setIsKindleMode] = useState(false)
  const [kindleTheme, setKindleTheme] = useState('void') // 'void' | 'sepia' | 'paper'
  const [kindleFont, setKindleFont] = useState('bookerly') // 'bookerly' | 'literata' | 'sans' | 'mono'
  const [kindleSize, setKindleSize] = useState(18) // 16, 18, 20, 22, 26
  const [kindleWidth, setKindleWidth] = useState('normal') // 'narrow' | 'normal' | 'wide'
  const [kindleSpacing, setKindleSpacing] = useState('normal') // 'compact' | 'normal' | 'relaxed'
  const [showSettings, setShowSettings] = useState(false)
  const [scrollPercent, setScrollPercent] = useState(0)

  useEffect(() => {
    try {
      const f = localStorage.getItem('hw_reader_format')
      if (f) setFormatMode(f)
      const t = localStorage.getItem('hw_kindle_theme')
      if (t) setKindleTheme(t)
      const font = localStorage.getItem('hw_kindle_font')
      if (font) setKindleFont(font)
      const sz = localStorage.getItem('hw_kindle_size')
      if (sz) setKindleSize(Number(sz))
      const w = localStorage.getItem('hw_kindle_width')
      if (w) setKindleWidth(w)
      const sp = localStorage.getItem('hw_kindle_spacing')
      if (sp) setKindleSpacing(sp)
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  function updateKindleSetting(key, value, setter) {
    setter(value)
    try {
      localStorage.setItem(`hw_kindle_${key}`, String(value))
    } catch {}
  }

  function toggleFormat(mode) {
    setFormatMode(mode)
    try {
      localStorage.setItem('hw_reader_format', mode)
    } catch {}
  }

  function changeFontSize(size) {
    updateKindleSetting('size', size, setKindleSize)
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isKindleMode) {
        setIsKindleMode(false)
        setShowSettings(false)
      }
      if (isKindleMode && (e.key === 't' || e.key === 'T') && !showSettings) {
        const themes = ['void', 'sepia', 'paper']
        const nextIdx = (themes.indexOf(kindleTheme) + 1) % themes.length
        updateKindleSetting('theme', themes[nextIdx], setKindleTheme)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isKindleMode, kindleTheme, showSettings])

  useEffect(() => {
    function handleScroll(e) {
      const target = isKindleMode ? e.target : document.documentElement
      const scrollTop = target.scrollTop || window.scrollY || 0
      const scrollHeight = (target.scrollHeight || document.documentElement.scrollHeight) - (target.clientHeight || window.innerHeight)
      if (scrollHeight > 0) {
        const pct = Math.min(100, Math.max(0, Math.round((scrollTop / scrollHeight) * 100)))
        setScrollPercent(pct)
      }
    }

    if (isKindleMode) {
      const el = document.getElementById('kindle-viewport')
      if (el) {
        el.addEventListener('scroll', handleScroll)
        return () => el.removeEventListener('scroll', handleScroll)
      }
    } else {
      window.addEventListener('scroll', handleScroll)
      return () => window.removeEventListener('scroll', handleScroll)
    }
  }, [isKindleMode])

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
      if (typeof id === 'string' && id.startsWith('archive-')) {
        const found = ARCHIVE_STORIES.find(s => s.id === id)
        if (found) return found
      }
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
    onSuccess: (newComment) => {
      setCommentContent('')
      queryClient.invalidateQueries({ queryKey: ['book_comments', id] })
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
      <a href="/library" className="border border-[var(--color-line)] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors">Back to Library</a>
    </div>
  )

  const isSubmitting = commentMutation.isPending
  const rtLabel = readingTime(book?.content)

  if (isKindleMode) {
    const words = book?.content?.trim().split(/\s+/).length || 0
    const totalMins = Math.max(1, Math.ceil(words / 200))
    const remainingMins = Math.max(0, Math.ceil(totalMins * (1 - scrollPercent / 100)))

    return (
      <div
        id="kindle-viewport"
        className={`kindle-immersive-mode kindle-theme-${kindleTheme} kindle-font-${kindleFont} kindle-leading-${kindleSpacing}`}
      >
        {/* Kindle Top HUD */}
        <header className="kindle-hud fixed top-0 inset-x-0 h-14 z-50 flex items-center justify-between px-4 sm:px-8 border-b backdrop-blur-md transition-all">
          <button
            type="button"
            onClick={() => {
              setIsKindleMode(false)
              setShowSettings(false)
            }}
            className="flex items-center gap-2 px-3 py-1.5 border text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer"
            title="Exit Kindle Focus Mode (or press Esc)"
          >
            <span>←</span>
            <span>Exit Focus <kbd className="hidden sm:inline opacity-60 text-[10px] font-sans">[Esc]</kbd></span>
          </button>

          <div className="hidden md:block max-w-md truncate text-center font-serif italic text-sm opacity-80">
            {book?.title}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-serif font-bold transition-colors cursor-pointer ${
                showSettings ? 'border-[var(--color-ember)] text-[var(--color-ember)]' : ''
              }`}
              title="Typography & Theme Settings (Aa)"
            >
              <span className="text-base leading-none">Aa</span>
              <span className="text-[11px] font-mono font-normal">Theme & Type</span>
            </button>

            {/* Floating Aa Popover */}
            {showSettings && (
              <div className="absolute right-0 top-12 w-80 sm:w-96 p-5 rounded-sm border shadow-2xl z-50 kindle-hud bg-[var(--color-surface)] text-[var(--color-text-primary)]">
                <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3 mb-4">
                  <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ember)]">Kindle Reader Settings</h3>
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="font-mono text-xs opacity-60 hover:opacity-100 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Theme selection */}
                <div className="mb-4">
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
                    Reading Theme
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => updateKindleSetting('theme', 'void', setKindleTheme)}
                      className={`py-2 px-2 border text-center transition-colors cursor-pointer ${
                        kindleTheme === 'void'
                          ? 'border-[var(--color-blood)] bg-black text-white ring-1 ring-[var(--color-blood)]'
                          : 'border-[var(--color-line)] bg-[#0a0a0c] text-neutral-400 hover:text-white'
                      }`}
                    >
                      🌑 Void Dark
                    </button>
                    <button
                      type="button"
                      onClick={() => updateKindleSetting('theme', 'sepia', setKindleTheme)}
                      className={`py-2 px-2 border text-center transition-colors cursor-pointer ${
                        kindleTheme === 'sepia'
                          ? 'border-[#A33A2D] bg-[#F4EFEA] text-[#2B231D] font-bold ring-1 ring-[#A33A2D]'
                          : 'border-[var(--color-line)] bg-[#E8DFD8] text-[#5C4E43] hover:text-[#2B231D]'
                      }`}
                    >
                      📜 Sepia
                    </button>
                    <button
                      type="button"
                      onClick={() => updateKindleSetting('theme', 'paper', setKindleTheme)}
                      className={`py-2 px-2 border text-center transition-colors cursor-pointer ${
                        kindleTheme === 'paper'
                          ? 'border-[#C8102E] bg-[#FAF9F6] text-[#1A1A1A] font-bold ring-1 ring-[#C8102E]'
                          : 'border-[var(--color-line)] bg-[#ECEBE4] text-[#4A4A4A] hover:text-[#1A1A1A]'
                      }`}
                    >
                      📄 Paper Light
                    </button>
                  </div>
                </div>

                {/* Font family selection */}
                <div className="mb-4">
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
                    Font Family
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => updateKindleSetting('font', 'bookerly', setKindleFont)}
                      className={`py-1.5 px-3 border text-left font-serif transition-colors cursor-pointer ${
                        kindleFont === 'bookerly'
                          ? 'border-[var(--color-blood)] bg-[var(--color-void)] text-[var(--color-ember)] font-bold'
                          : 'border-[var(--color-line)] opacity-80 hover:opacity-100'
                      }`}
                    >
                      Bookerly (Classic)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateKindleSetting('font', 'literata', setKindleFont)}
                      className={`py-1.5 px-3 border text-left font-serif transition-colors cursor-pointer ${
                        kindleFont === 'literata'
                          ? 'border-[var(--color-blood)] bg-[var(--color-void)] text-[var(--color-ember)] font-bold'
                          : 'border-[var(--color-line)] opacity-80 hover:opacity-100'
                      }`}
                    >
                      Literata (Editorial)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateKindleSetting('font', 'sans', setKindleFont)}
                      className={`py-1.5 px-3 border text-left font-sans transition-colors cursor-pointer ${
                        kindleFont === 'sans'
                          ? 'border-[var(--color-blood)] bg-[var(--color-void)] text-[var(--color-ember)] font-bold'
                          : 'border-[var(--color-line)] opacity-80 hover:opacity-100'
                      }`}
                    >
                      Clean Sans
                    </button>
                    <button
                      type="button"
                      onClick={() => updateKindleSetting('font', 'mono', setKindleFont)}
                      className={`py-1.5 px-3 border text-left font-mono transition-colors cursor-pointer ${
                        kindleFont === 'mono'
                          ? 'border-[var(--color-blood)] bg-[var(--color-void)] text-[var(--color-ember)] font-bold'
                          : 'border-[var(--color-line)] opacity-80 hover:opacity-100'
                      }`}
                    >
                      Typewriter Mono
                    </button>
                  </div>
                </div>

                {/* Font size step */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">Font Size</span>
                    <span className="font-mono text-xs text-[var(--color-ember)] font-bold">{kindleSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[16, 18, 20, 22, 26].map(sz => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => updateKindleSetting('size', sz, setKindleSize)}
                        className={`flex-1 py-1 border text-xs font-mono transition-colors cursor-pointer ${
                          kindleSize === sz
                            ? 'border-[var(--color-blood)] bg-[var(--color-blood)] text-white font-bold'
                            : 'border-[var(--color-line)] hover:border-white'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Margins & Spacing */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                      Column Width
                    </label>
                    <div className="flex border border-[var(--color-line)]">
                      {[
                        { id: 'narrow', label: 'Narrow' },
                        { id: 'normal', label: 'Normal' },
                        { id: 'wide', label: 'Wide' },
                      ].map(w => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => updateKindleSetting('width', w.id, setKindleWidth)}
                          className={`flex-1 py-1 font-mono text-[10px] uppercase transition-colors cursor-pointer ${
                            kindleWidth === w.id
                              ? 'bg-[var(--color-blood)] text-white font-bold'
                              : 'hover:text-white'
                          }`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                      Line Height
                    </label>
                    <div className="flex border border-[var(--color-line)]">
                      {[
                        { id: 'compact', label: 'Compact' },
                        { id: 'normal', label: 'Normal' },
                        { id: 'relaxed', label: 'Relaxed' },
                      ].map(sp => (
                        <button
                          key={sp.id}
                          type="button"
                          onClick={() => updateKindleSetting('spacing', sp.id, setKindleSpacing)}
                          className={`flex-1 py-1 font-mono text-[10px] uppercase transition-colors cursor-pointer ${
                            kindleSpacing === sp.id
                              ? 'bg-[var(--color-blood)] text-white font-bold'
                              : 'hover:text-white'
                          }`}
                        >
                          {sp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Paragraph Formatting Mode */}
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                    Paragraph Style
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => toggleFormat('modern')}
                      className={`py-1.5 px-2 border transition-colors cursor-pointer ${
                        formatMode === 'modern'
                          ? 'border-[var(--color-blood)] bg-[var(--color-blood)] text-white font-bold'
                          : 'border-[var(--color-line)] hover:border-white'
                      }`}
                    >
                      ¶ Modern Spacing
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFormat('novel')}
                      className={`py-1.5 px-2 border transition-colors cursor-pointer ${
                        formatMode === 'novel'
                          ? 'border-[var(--color-blood)] bg-[var(--color-blood)] text-white font-bold'
                          : 'border-[var(--color-line)] hover:border-white'
                      }`}
                    >
                      📖 Novel Indent
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Story Prose Container */}
        <main
          className={`kindle-width-${kindleWidth} mx-auto pt-16 pb-24`}
          style={{ fontSize: `${kindleSize}px` }}
        >
          {/* Header */}
          <div className="text-center pb-8 mb-10 border-b border-current opacity-70">
            <p className="font-mono text-xs uppercase tracking-widest mb-3 opacity-60">
              A story by @{book?.profiles?.handle || 'unknown'}
            </p>
            <h1 className="text-3xl md:text-5xl font-serif font-black tracking-tight mb-4 leading-tight">
              {book?.title}
            </h1>
            {book?.lede && (
              <p className="font-serif italic text-base md:text-lg opacity-80 max-w-xl mx-auto leading-relaxed">
                {book.lede}
              </p>
            )}
          </div>

          {/* Prose Content */}
          <article
            className={`prose-book prose max-w-none ${
              formatMode === 'novel' ? 'format-novel' : ''
            }`}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[rehypeRaw]}
            >
              {book?.content || ''}
            </ReactMarkdown>
          </article>

          {/* End of story marker */}
          <div className="mt-16 pt-8 border-t border-current opacity-40 text-center font-serif italic text-sm">
            <p className="mb-4">~ Finis ~</p>
            <button
              type="button"
              onClick={() => {
                setIsKindleMode(false)
                setShowSettings(false)
              }}
              className="font-mono text-xs uppercase tracking-wider px-4 py-2 border border-current hover:opacity-100 transition-opacity cursor-pointer"
            >
              Exit Kindle Mode &amp; Return to Discussions
            </button>
          </div>
        </main>

        {/* Bottom Sticky Telemetry HUD */}
        <footer className="kindle-hud fixed bottom-0 inset-x-0 h-10 z-50 flex items-center justify-between px-4 sm:px-8 border-t backdrop-blur-md text-xs font-mono select-none">
          <div className="flex items-center gap-2 opacity-70 truncate max-w-[40%]">
            <span>@{book?.profiles?.handle || 'author'}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block w-24 sm:w-36 h-1.5 bg-neutral-700/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-blood)] transition-all duration-150"
                style={{ width: `${scrollPercent}%` }}
              />
            </div>
            <span className="font-bold">{scrollPercent}%</span>
          </div>

          <div className="opacity-70 text-right">
            <span>{remainingMins === 0 ? 'Story Complete' : `~${remainingMins} min left`}</span>
          </div>
        </footer>
      </div>
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
          <QuoteSharer title={book?.title} />

          {book?.is_artificial && (
            <div className="mb-8 p-4 border border-[var(--color-upside)]/50 bg-[var(--color-upside)]/10 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-2.5 text-[var(--color-upside)]">
                <span className="text-xl">📼</span>
                <div>
                  <strong className="tracking-wider uppercase">Public Archive Sample (Artificial / Pre-Seeded)</strong>
                  <p className="text-[11px] text-[var(--color-text-secondary)] font-serif italic mt-0.5">
                    This piece is a public-domain horror masterwork preserved as an archival showcase.
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
        <div className="flex justify-center items-center gap-4 text-xs font-mono text-[var(--color-text-secondary)] mb-4">
          <span>A story by @{book?.profiles?.handle || 'unknown'}</span>
          <button 
            onClick={() => setReportTarget({ type: 'story', id: book.id })} 
            className="text-xs uppercase border border-[var(--color-line)] hover:border-[var(--color-blood)] px-2 py-0.5 text-[var(--color-ash)] hover:text-[var(--color-blood)] cursor-pointer"
          >
            Report
          </button>
          {book && session?.user?.id === book.author_id && (
            <a 
              href={`/library/edit/${book.id}`}
              className="text-xs uppercase border border-[var(--color-line)] hover:border-[var(--color-bone)] px-2 py-0.5 text-[var(--color-ash)] hover:text-[var(--color-bone)] transition-colors"
            >
              Edit Story
            </a>
          )}
          {book && session?.user?.id !== book.author_id && (
            <BlockButton targetUserId={book.author_id} targetHandle={book?.profiles?.handle} />
          )}
          {book && session?.user?.id === book.author_id && book.mod_status !== 'live' && (
            <AppealButton modActionId={book.id} targetType="story" />
          )}
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
              setShowSettings(false)
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-[var(--color-blood)] hover:bg-[var(--color-blood)]/80 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
            title="Open full distraction-free Kindle reading mode"
          >
            <span className="text-sm">⛶</span>
            <span>Kindle Focus Mode</span>
          </button>

          <span className="text-[var(--color-line)] hidden sm:inline">|</span>

          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">Format:</span>
          <button
            type="button"
            onClick={() => toggleFormat('modern')}
            className={`px-2 py-0.5 border text-xs cursor-pointer transition-colors ${
              formatMode === 'modern'
                ? 'bg-[var(--color-blood)] text-white border-[var(--color-blood)]'
                : 'border-[var(--color-line)] hover:border-white text-[var(--color-text-primary)]'
            }`}
          >
            ¶ Modern
          </button>
          <button
            type="button"
            onClick={() => toggleFormat('novel')}
            className={`px-2 py-0.5 border text-xs cursor-pointer transition-colors ${
              formatMode === 'novel'
                ? 'bg-[var(--color-blood)] text-white border-[var(--color-blood)]'
                : 'border-[var(--color-line)] hover:border-white text-[var(--color-text-primary)]'
            }`}
          >
            📖 Novel
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Quick Toggle */}
          <div className="flex items-center border border-[var(--color-line)]">
            <button
              type="button"
              onClick={() => updateKindleSetting('theme', 'void', setKindleTheme)}
              title="Void Dark Theme"
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer ${
                kindleTheme === 'void' ? 'bg-[var(--color-line)] text-white font-bold' : 'hover:text-white'
              }`}
            >
              Void
            </button>
            <button
              type="button"
              onClick={() => updateKindleSetting('theme', 'sepia', setKindleTheme)}
              title="Sepia Paperback Theme"
              className={`px-2 py-0.5 text-xs font-mono border-l border-[var(--color-line)] transition-colors cursor-pointer ${
                kindleTheme === 'sepia' ? 'bg-[#F4EFEA] text-[#2B231D] font-bold' : 'hover:text-white'
              }`}
            >
              Sepia
            </button>
            <button
              type="button"
              onClick={() => updateKindleSetting('theme', 'paper', setKindleTheme)}
              title="Paper Light Theme"
              className={`px-2 py-0.5 text-xs font-mono border-l border-[var(--color-line)] transition-colors cursor-pointer ${
                kindleTheme === 'paper' ? 'bg-[#FAF9F6] text-[#1A1A1A] font-bold' : 'hover:text-white'
              }`}
            >
              Paper
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
                  onClick={() => changeFontSize(sz)}
                  className={`px-1.5 py-0.5 border cursor-pointer font-serif text-xs ${
                    kindleSize === sz
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
      </div>

      {/* Story Content Block */}
      <article
        className={`prose-book prose font-serif leading-relaxed text-[var(--color-text-primary)] mb-12 kindle-theme-${kindleTheme} kindle-font-${kindleFont} kindle-leading-${kindleSpacing} ${
          kindleTheme === 'void' ? 'prose-invert' : ''
        } ${
          formatMode === 'novel' ? 'format-novel' : ''
        }`}
        style={{ fontSize: `${kindleSize}px`, padding: kindleTheme !== 'void' ? '2rem' : '0', borderRadius: kindleTheme !== 'void' ? '4px' : '0' }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[rehypeRaw]}
        >
          {book?.content || ''}
        </ReactMarkdown>
      </article>

      {/* Share Bar */}
      <div className="max-w-2xl mx-auto border-t border-[var(--color-line)] pt-8">
        <ShareBar title={book?.title} />
      </div>

      {/* Critiques Section */}
      <div className="max-w-2xl mx-auto border-t border-[var(--color-line)] pt-12 mt-16">
        <h3 className="font-serif font-black text-xl text-[var(--color-text-primary)] mb-8 uppercase tracking-wide">
          Critiques &amp; Responses <span className="font-mono text-sm text-[var(--color-text-secondary)] font-normal ml-1">({comments.length})</span>
        </h3>

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
                        <span className="font-mono text-xs font-bold text-[var(--color-text-primary)]">@{handle}</span>
                        <span className="font-mono text-xs text-[var(--color-text-secondary)]">{timeAgo(c.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex gap-3 items-center text-xs font-mono">
                      <CritiqueSignalBadge currentBookVersion={book?.version || 1} commentBookVersion={c.book_version || 1} />
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
