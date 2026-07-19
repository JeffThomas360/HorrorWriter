import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { withProviders } from '../components/Providers'

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

async function fetchCategories() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

async function fetchThreads() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('threads')
    .select('*, profiles(handle)')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

function Forum() {
  const { session, profile } = useAuth()
  const [activeCat, setActiveCat] = useState('all')
  const [query, setQuery] = useState('')
  const [onlineUsers, setOnlineUsers] = useState([])

  const { data: categories = [], isLoading: catLoading, error: catError } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const { data: threads = [], isLoading: threadLoading, error: threadError } = useQuery({
    queryKey: ['threads'],
    queryFn: fetchThreads,
  })

  useEffect(() => {
    if (!supabase) return
    const presenceKey = session?.user?.id || 'anonymous-' + Math.random().toString(36).substr(2, 9)
    const channel = supabase.channel('global:lobby', {
      config: { presence: { key: presenceKey } },
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const users = []
      Object.keys(state).forEach((key) => {
        const presences = state[key]
        if (presences && presences.length > 0) {
          const p = presences[0]
          users.push({
            id: key,
            handle: p.handle || 'Guest',
            onlineAt: p.online_at,
          })
        }
      })
      setOnlineUsers(users)
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          handle: profile?.handle || (session?.user ? 'Summoning...' : 'Guest'),
          online_at: new Date().toISOString(),
        })
      }
    })

    return () => { channel.unsubscribe() }
  }, [session, profile])

  const loading = catLoading || threadLoading
  const error = catError ? catError.message : threadError ? threadError.message : null

  const catLabels = useMemo(() => {
    return categories.reduce((acc, c) => {
      acc[c.id] = c.name.split('·')[0].trim()
      return acc
    }, {})
  }, [categories])

  const visible = useMemo(() => {
    const base = activeCat === 'all' ? threads : threads.filter(t => t.category_id === activeCat)
    if (!query.trim()) return base
    const q = query.toLowerCase()
    return base.filter(t => {
      const by = t.profiles?.handle || ''
      return t.title.toLowerCase().includes(q) ||
        by.toLowerCase().includes(q) ||
        (catLabels[t.category_id] || '').toLowerCase().includes(q)
    })
  }, [activeCat, query, threads, catLabels])

  if (loading) return (
    <div className="mt-8">
      <div className="border-b border-[#2d2d2a] pb-6 mb-8">
        <span className="block font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-text-secondary)] mb-2">The Forums</span>
        <h2 className="text-3xl font-serif font-black">The <em class="italic text-[var(--color-accent-crimson)] font-serif">Crypt</em></h2>
      </div>
      <div className="flex flex-col items-center justify-center min-h-[30vh]">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Entering the crypt…</p>
      </div>
    </div>
  )
  if (error) return (
    <div className="vintage-card text-center py-12 border-red-950 mt-8">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-accent-crimson)] mb-4">Error</p>
      <p className="font-serif italic text-sm text-[var(--color-text-secondary)]">{error}</p>
    </div>
  )

  return (
    <div className="mt-8">
      <div className="border-b border-[#2d2d2a] pb-6 mb-8">
        <span className="block font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-text-secondary)] mb-2">The Forums</span>
        <h2 className="text-3xl font-serif font-black">The <em class="italic text-[var(--color-accent-crimson)] font-serif">Crypt</em></h2>
        <p className="text-xs text-[var(--color-text-secondary)] font-serif mt-1">Where the conversations live. Pick a category, or search the dark.</p>
      </div>

      <div className="forum-grid grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Sidebar */}
        <aside className="flex flex-col gap-6 md:col-span-1">
          {/* Category Filter */}
          <div className="vintage-card p-4">
            <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] mb-3 border-b border-[#2d2d2a] pb-2">Categories</h4>
            <ul className="flex flex-col gap-2 font-serif text-xs">
              <li
                className={`flex justify-between items-center py-1 px-2 cursor-pointer transition-colors ${'all' === activeCat ? 'bg-[var(--color-accent-crimson)] text-white' : 'hover:text-[var(--color-accent-crimson)] text-[var(--color-text-secondary)]'}`}
                onClick={() => setActiveCat('all')}
              >
                <span>All Threads</span>
                <span className="font-mono text-xs">{threads.length}</span>
              </li>
              {categories.map(c => {
                const count = threads.filter(t => t.category_id === c.id).length
                return (
                  <li
                    key={c.id}
                    className={`flex justify-between items-center py-1 px-2 cursor-pointer transition-colors ${c.id === activeCat ? 'bg-[var(--color-accent-crimson)] text-white' : 'hover:text-[var(--color-accent-crimson)] text-[var(--color-text-secondary)]'}`}
                    onClick={() => setActiveCat(c.id)}
                  >
                    <span>{c.name.split('·')[0].trim()}</span>
                    <span className="font-mono text-xs">{count.toLocaleString()}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Guidelines Block */}
          <div className="vintage-card p-4">
            <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] mb-2 border-b border-[#2d2d2a] pb-2">House Rules</h4>
            <p className="text-xs font-serif leading-relaxed text-[var(--color-text-secondary)]">
              Read before posting. Critique is a gift; cruelty is not. Spoilers warned. No promo without a story attached.
            </p>
          </div>

          {/* Users Online */}
          <div className="vintage-card p-4">
            <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] mb-3 border-b border-[#2d2d2a] pb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-800 animate-pulse"></span>
              Writers Online ({onlineUsers.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {onlineUsers.map((u) => {
                const isGuest = u.handle === 'Guest' || u.handle === 'Summoning...'
                const name = isGuest ? 'Guest' : `@${u.handle}`
                const initialsStr = isGuest ? '??' : initials(u.handle)
                return (
                  <div
                    key={u.id}
                    title={name}
                    className="w-8 h-8 rounded-full bg-[var(--color-bg-primary)] border border-[#2d2d2a] flex items-center justify-center font-mono text-xs text-[var(--color-text-secondary)] hover:border-white transition-colors"
                  >
                    {initialsStr}
                  </div>
                )
              })}
              {onlineUsers.length === 0 && (
                <span className="font-serif italic text-xs text-[var(--color-text-secondary)] py-2">
                  The dark is quiet.
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="md:col-span-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex-1 min-w-0">
              <input
                placeholder="Search threads, authors, tags…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search forum threads"
                className="w-full bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-4 py-2 text-xs font-mono focus:outline-none focus:border-[var(--color-accent-crimson)]"
              />
            </div>
            {session ? (
              <a href="/forum/new" className="shrink-0 text-center bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-4 py-2 hover:bg-red-700 transition-colors">
                New Thread
              </a>
            ) : (
              <span className="shrink-0 text-center font-mono text-xs border border-[#2d2d2a] text-[var(--color-text-secondary)] px-3 py-2 uppercase">Sign in to post</span>
            )}
          </div>

          {visible.length === 0 && (
            <div className="vintage-card text-center py-16">
              <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mb-6">Nothing here. The dark is quiet tonight.</p>
              {session ? (
                <a href="/forum/new" className="border border-[#2d2d2a] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors">
                  Start the first thread
                </a>
              ) : (
                <span className="font-mono text-xs border border-[#2d2d2a] text-[var(--color-text-secondary)] px-3 py-1.5 uppercase">Sign in to post</span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-4">
            {visible.map((t) => {
              const handle = t.profiles?.handle || 'unknown'
              return (
                <a 
                  key={t.id}
                  href={`/forum/thread/${t.id}`}
                  className="vintage-card flex items-center justify-between gap-4 hover:border-[var(--color-accent-crimson)] transition-colors p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[var(--color-bg-primary)] border border-[#2d2d2a] flex items-center justify-center font-mono text-xs text-[var(--color-text-secondary)] shrink-0">
                      {initials(handle)}
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-sm text-[var(--color-text-primary)] flex items-center gap-2 mb-1">
                        {t.pinned && <span className="text-xs" title="Pinned">📌</span>}
                        {t.title}
                      </h4>
                      <div className="font-mono text-xs text-[var(--color-text-secondary)]">
                        <span className="text-[var(--color-text-primary)] font-bold mr-1">@{handle}</span>
                        · {catLabels[t.category_id] || 'Thread'} · {timeAgo(t.updated_at)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block font-mono text-sm font-bold text-[var(--color-text-primary)]">{t.replies_count || 0}</span>
                    <span className="block font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">replies</span>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default withProviders(Forum)
