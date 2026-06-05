import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const AV_COLORS = ['', 'av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']
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

export default function ThreadView() {
  const { id } = useParams()
  const { session } = useAuth()
  const queryClient = useQueryClient()

  const [replyContent, setReplyContent] = useState('')
  const [replyError, setReplyError] = useState(null)
  const [activeReadersCount, setActiveReadersCount] = useState(1)

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

  useDocumentTitle(thread ? thread.title : 'Loading…')

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

  const handleFlag = async (targetType, targetId) => {
    if (!supabase || !session) return
    const reason = window.prompt("Reason for report (offensive content, spam, harassment):")
    if (reason === null) return // User cancelled
    
    try {
      const { error } = await supabase
        .from('moderation_flags')
        .insert({
          reporter_id: session.user.id,
          target_type: targetType,
          target_id: targetId,
          reason: reason.trim() || null
        })
      
      if (error) {
        if (error.code === '23505' || error.message?.includes('unique')) {
          alert('You have already flagged this content.')
        } else {
          throw error
        }
      } else {
        alert('Content flagged for review. Thank you for keeping the coven safe.')
      }
    } catch (err) {
      alert(err.message || 'Failed to report content.')
    }
  }

  const isSubmitting = replyMutation.isPending

  if (loading) return (
    <section className="surface">
      <div className="status-panel">
        <p className="loading-pulse">Descending…</p>
      </div>
    </section>
  )
  if (error) return (
    <section className="surface">
      <div className="status-panel">
        <p className="eyebrow error">Something went wrong</p>
        <p className="status-panel-body">{error}</p>
        <Link to="/forum" className="btn ghost">Back to the Crypt</Link>
      </div>
    </section>
  )

  return (
    <section className="surface" style={{ maxWidth: 820, margin: '0 auto' }}>
      <Link
        to="/forum"
        className="eyebrow"
        style={{ marginBottom: 12 }}
      >
        ← Back to {thread?.categories?.name?.split('·')[0].trim() || 'The Crypt'}
      </Link>

      <h1 className="title" style={{ fontSize: 'clamp(32px, 4.5vw, 48px)', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <span>{thread?.title}</span>
        {session && session.user.id !== thread?.author_id && (
          <button 
            type="button"
            onClick={() => handleFlag('thread', thread.id)}
            style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px', opacity: 0.7 }}
          >
            🏳 Report
          </button>
        )}
      </h1>

      <span className="chip live" style={{ marginBottom: 32 }}>
        {activeReadersCount} {activeReadersCount === 1 ? 'writer reading' : 'writers reading'}
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {posts.map((p, index) => {
          const handle = p.profiles?.handle || 'unknown'
          const avColorIndex = (handle.length % 6) + 1
          return (
            <article key={p.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', marginBottom: 14 }}>
                <div className="author" style={{ marginBottom: 0 }}>
                  <div className={`avatar ${AV_COLORS[avColorIndex]}`} style={{ width: 36, height: 36, fontSize: 13 }}>
                    {initials(handle)}
                  </div>
                  <div className="who">
                    <span className="name">@{handle}</span>
                    <span className="when">
                      {index === 0 ? 'Original Post' : `Reply #${index}`} · {timeAgo(p.created_at)}
                    </span>
                  </div>
                </div>
                {session && session.user.id !== p.author_id && (
                  <button 
                    type="button" 
                    onClick={() => handleFlag('post', p.id)}
                    style={{ fontSize: 12, color: 'var(--muted)', opacity: 0.7, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}
                    className="flag-btn"
                  >
                    🏳 Report
                  </button>
                )}
              </div>
              <div className="body">{p.content}</div>
            </article>
          )
        })}

        {hasNextPage && (
          <div className="text-center" style={{ marginTop: 16 }}>
            <button
              className="btn ghost"
              onClick={fetchNextPage}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Summoning…' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      {session ? (
        <div style={{ marginTop: 56, paddingTop: 32, borderTop: '1px solid var(--line)' }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, marginBottom: 14, color: 'var(--paper)' }}>
            Leave a reply
          </h3>
          <form onSubmit={handleReply}>
            <div className="profile-field-input" style={{ marginBottom: 14 }}>
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Speak into the void…"
                rows={5}
                required
              />
            </div>
            <div className="row-flex">
              <button type="submit" className="btn blood" disabled={isSubmitting}>
                {isSubmitting ? 'Summoning…' : 'Post Reply'}
              </button>
              {replyError && <span className="form-err">{replyError}</span>}
            </div>
          </form>
        </div>
      ) : (
        <div className="empty" style={{ marginTop: 48 }}>
          <p>You must enter the void to reply.</p>
          <span className="soon-chip">Sign in to reply</span>
        </div>
      )}
    </section>
  )
}
