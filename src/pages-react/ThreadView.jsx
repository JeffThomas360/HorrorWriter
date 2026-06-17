import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReportModal from '../components/ReportModal'
import InlineModControls from '../components/mod/InlineModControls'
import MarkdownEditor from '../components/MarkdownEditor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { withProviders } from '../components/Providers'

const PAGE_SIZE = 15

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

function ThreadView({ id }) {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  const [replyContent, setReplyContent] = useState('')
  const [replyError, setReplyError] = useState(null)
  const [activeReadersCount, setActiveReadersCount] = useState(1)
  const [reportTarget, setReportTarget] = useState(null)

  const { data: thread, isLoading: threadLoading, error: threadError } = useQuery({
    queryKey: ['thread', id],
    queryFn: async () => {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('threads')
        .select('*, profiles(handle), categories(name)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    }
  })

  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: postsLoading,
    error: postsError
  } = useInfiniteQuery({
    queryKey: ['posts', id],
    queryFn: async ({ pageParam = 0 }) => {
      if (!supabase) return []
      const from = pageParam * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles(handle)')
        .eq('thread_id', id)
        .order('created_at', { ascending: true })
        .range(from, to)
      if (error) throw error
      return data || []
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_SIZE ? allPages.length : undefined
    }
  })

  const posts = postsData ? postsData.pages.flat() : []
  const loading = threadLoading || postsLoading
  const error = threadError
    ? 'Thread lost to the void. It may have been deleted.'
    : postsError ? 'Failed to load posts.' : null

  useEffect(() => {
    if (!supabase || !id) return
    const presenceKey = session?.user?.id || 'anonymous-' + Math.random().toString(36).substr(2, 9)
    const channel = supabase.channel(`thread:${id}`, {
      config: { presence: { key: presenceKey } },
    })

    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'posts', filter: `thread_id=eq.${id}` },
      (payload) => {
        const newPost = payload.new
        const cachedData = queryClient.getQueryData(['posts', id])
        const existingPosts = cachedData ? cachedData.pages.flat() : []
        const alreadyExists = existingPosts.some(p => p.id === newPost.id)
        if (!alreadyExists) {
          queryClient.invalidateQueries({ queryKey: ['posts', id] })
          queryClient.invalidateQueries({ queryKey: ['threads'] })
        }
      }
    )

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      setActiveReadersCount(Object.keys(state).length)
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() })
      }
    })

    return () => { channel.unsubscribe() }
  }, [id, session, queryClient])

  const replyMutation = useMutation({
    mutationFn: async (content) => {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          thread_id: id,
          author_id: session.user.id,
          content: content.trim()
        })
        .select('*, profiles(handle)')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      setReplyContent('')
      queryClient.invalidateQueries({ queryKey: ['posts', id] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
    },
    onError: (err) => {
      setReplyError(err.message || 'Failed to post reply.')
    }
  })

  const handleReply = (e) => {
    e.preventDefault()
    setReplyError(null)
    if (!replyContent.trim()) {
      setReplyError('Cannot speak nothingness.')
      return
    }
    replyMutation.mutate(replyContent)
  }

  const isSubmitting = replyMutation.isPending

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh]">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Descending…</p>
    </div>
  )
  if (error) return (
    <div className="vintage-card text-center py-12 border-red-950 mt-8 max-w-2xl mx-auto">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-accent-crimson)] mb-4">Error</p>
      <p className="font-serif italic text-sm text-[var(--color-text-secondary)] mb-6">{error}</p>
      <a href="/forum" className="border border-[#2d2d2a] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors">Back to the Crypt</a>
    </div>
  )

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <a
        href="/forum"
        className="inline-block font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--color-accent-crimson)] mb-4 hover:underline"
      >
        ← Back to {thread?.categories?.name?.split('·')[0].trim() || 'The Crypt'}
      </a>

      <div className="border-b border-[#2d2d2a] pb-6 mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="title text-2xl md:text-3xl font-serif font-black text-[var(--color-text-primary)] leading-tight mb-2">
            {thread?.title}
          </h1>
          <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-text-secondary)]">
            <span className="w-1 h-1 rounded-full bg-red-800 animate-pulse"></span>
            {activeReadersCount} {activeReadersCount === 1 ? 'writer reading' : 'writers reading'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <button 
            onClick={() => setReportTarget({ type: 'thread', id: thread?.id })} 
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] border border-[#2d2d2a] px-2 py-0.5 hover:border-red-950 cursor-pointer"
          >
            Report
          </button>
          {thread && <InlineModControls targetType="thread" targetId={thread.id} currentStatus={thread.mod_status} authorId={thread.author_id} />}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {posts.map((p, index) => {
          const handle = p.profiles?.handle || 'unknown'
          return (
            <article key={p.id} className="vintage-card flex flex-col gap-4">
              <div className="flex justify-between items-start border-b border-[#2d2d2a] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--color-bg-primary)] border border-[#2d2d2a] flex items-center justify-center font-mono text-xs text-[var(--color-text-secondary)]">
                    {initials(handle)}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-mono text-xs font-bold text-[var(--color-accent-crimson)]">@{handle}</span>
                    <span className="font-mono text-[9px] text-[var(--color-text-secondary)]">
                      {index === 0 ? 'Original Post' : `Reply #${index}`} · {timeAgo(p.created_at)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 items-center text-[10px] font-mono">
                  <button 
                    onClick={() => setReportTarget({ type: 'post', id: p.id })} 
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
                  >
                    Report
                  </button>
                  <InlineModControls targetType="post" targetId={p.id} currentStatus={p.mod_status} authorId={p.author_id} />
                </div>
              </div>
              <div className="prose prose-invert font-serif text-sm leading-relaxed text-[var(--color-text-primary)]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.content}</ReactMarkdown>
              </div>
            </article>
          )
        })}

        {hasNextPage && (
          <div className="text-center mt-6">
            <button
              className="border border-[#2d2d2a] hover:border-white text-[var(--color-text-primary)] font-mono text-xs uppercase px-4 py-2 transition-colors cursor-pointer"
              onClick={fetchNextPage}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Summoning…' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      {session ? (
        <div className="mt-12 border-t border-[#2d2d2a] pt-8">
          <h3 className="font-serif font-bold text-sm text-[var(--color-text-primary)] mb-4 uppercase tracking-wide">
            Leave a reply
          </h3>
          <form onSubmit={handleReply}>
            <div className="mb-4">
              <MarkdownEditor
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Speak into the void…"
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
                {isSubmitting ? 'Summoning…' : 'Post Reply'}
              </button>
              {replyError && <span className="form-err font-mono text-xs text-[var(--color-accent-crimson)]">{replyError}</span>}
            </div>
          </form>
        </div>
      ) : (
        <div className="vintage-card text-center py-8 mt-12">
          <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mb-4">You must enter the void to reply.</p>
          <button 
            className="font-mono text-xs uppercase border border-[#2d2d2a] hover:border-white px-4 py-2 transition-colors cursor-pointer"
            onClick={() => window.dispatchEvent(new CustomEvent('open-signin'))}
          >
            Sign In to Reply
          </button>
        </div>
      )}

      <ReportModal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetType={reportTarget?.type}
        targetId={reportTarget?.id}
      />
    </div>
  )
}

export default withProviders(ThreadView)
