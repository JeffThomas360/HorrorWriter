import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const AV_COLORS = ['','av-1','av-2','av-3','av-4','av-5','av-6']

function initials(handle) {
  if (!handle) return '??'
  return handle.split('-').map(w => w[0].toUpperCase()).slice(0,2).join('')
}

function timeAgo(dateString) {
  if (!dateString) return ''
  const d = new Date(dateString)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m`
  if (diff < 86400) return `${Math.floor(diff/3600)}h`
  return `${Math.floor(diff/86400)}d`
}

const PAGE_SIZE = 15

export default function ThreadView() {
  const { id } = useParams()
  const { session } = useAuth()
  const queryClient = useQueryClient()
  
  // Reply state
  const [replyContent, setReplyContent] = useState('')
  const [replyError, setReplyError] = useState(null)

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

  useDocumentTitle(thread ? thread.title : 'Loading Thread...')

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
  const error = threadError ? 'Thread lost to the void. It may have been deleted.' : postsError ? 'Failed to load posts.' : null

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
  const loadMore = fetchNextPage
  const hasMore = hasNextPage
  const loadingMore = isFetchingNextPage

  if (loading) return <section className="surface active"><p className="dim">Descending...</p></section>
  if (error) return <section className="surface active"><p className="error">{error}</p><Link to="/forum" className="btn ghost">Go Back</Link></section>

  return (
    <div className="layout-content fade-in">
      <section className="surface active">
        <Link to="/forum" className="eyebrow" style={{ display: 'inline-block', marginBottom: '1rem', color: 'var(--cyan)' }}>
          &larr; Back to {thread?.categories?.name || 'The Crypt'}
        </Link>
        <h2 className="title" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{thread?.title}</h2>
        
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {posts.map((p, index) => {
            const handle = p.profiles?.handle || 'unknown'
            const avColorIndex = (handle.length % 6) + 1
            
            return (
              <div key={p.id} style={{ 
                background: 'var(--void)', 
                padding: '1.5rem', 
                borderRadius: 'var(--r)',
                border: '1px solid rgba(255,255,255,0.05)',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <div className={`avatar ${AV_COLORS[avColorIndex]}`} style={{ width: 40, height: 40, fontSize: 14 }}>
                    {initials(handle)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--bone)' }}>@{handle}</div>
                    <div style={{ fontSize: 13, color: 'var(--bone-dim)' }}>
                      {index === 0 ? 'Original Post' : `Reply #${index}`} &middot; {timeAgo(p.created_at)}
                    </div>
                  </div>
                </div>
                
                <div style={{ 
                  color: 'var(--bone-dim)', 
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {p.content}
                </div>
              </div>
            )
          })}
          
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button 
                className="btn ghost" 
                onClick={loadMore} 
                disabled={loadingMore}
              >
                {loadingMore ? 'Summoning...' : '▸ Load More'}
              </button>
            </div>
          )}
        </div>

        {session ? (
          <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Leave a Reply</h3>
            <form onSubmit={handleReply}>
              <textarea 
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Speak into the void..."
                rows={5}
                required
                style={{ 
                  width: '100%', 
                  background: 'var(--void)', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--bone)',
                  padding: '1rem',
                  fontFamily: 'var(--font-mono)',
                  borderRadius: 'var(--r)',
                  resize: 'vertical',
                  marginBottom: '1rem'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button type="submit" className="btn primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Summoning...' : '▸ Post Reply'}
                </button>
                {replyError && <span className="error" style={{ fontSize: 14 }}>{replyError}</span>}
              </div>
            </form>
          </div>
        ) : (
          <div style={{ marginTop: '3rem', textAlign: 'center', padding: '2rem', background: 'var(--void)', borderRadius: 'var(--r)' }}>
            <p style={{ color: 'var(--bone-dim)', marginBottom: '1rem' }}>You must enter the void to reply.</p>
            <span className="soon-chip">Sign in to reply</span>
          </div>
        )}

      </section>
    </div>
  )
}
