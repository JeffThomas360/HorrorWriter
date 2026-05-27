import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useAuth } from '../components/AuthContext'
import { useQuery } from '@tanstack/react-query'

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

export default function Forum() {
  useDocumentTitle('The Crypt')
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
    <section className="surface">
      <div className="status-panel">
        <p className="loading-pulse">Descending into the Crypt…</p>
      </div>
    </section>
  )
  if (error) return (
    <section className="surface">
      <div className="status-panel">
        <p className="eyebrow error">Error loading forum</p>
        <p className="status-panel-body">{error}</p>
      </div>
    </section>
  )

  return (
    <section className="surface">
      <div className="section-head">
        <div className="left">
          <p className="eyebrow">The Forums</p>
          <h2>The <em>Crypt</em></h2>
          <p>Where the conversations live. Pick a category, or search the dark.</p>
        </div>
      </div>

      <div className="forum-grid">
        <aside>
          <ul className="cat-list">
            <li
              className={'all' === activeCat ? 'active' : ''}
              onClick={() => setActiveCat('all')}
            >
              <span className="name">All Threads</span>
              <span className="count">{threads.length}</span>
            </li>
            {categories.map(c => {
              const count = threads.filter(t => t.category_id === c.id).length
              return (
                <li
                  key={c.id}
                  className={c.id === activeCat ? 'active' : ''}
                  onClick={() => setActiveCat(c.id)}
                >
                  <span className="name">{c.name.split('·')[0].trim()}</span>
                  <span className="count">{count.toLocaleString()}</span>
                </li>
              )
            })}
          </ul>

          <div className="aside-card">
            <h4>House Rules</h4>
            <p>
              Read before posting. Critique is a gift; cruelty is not.
              Spoilers warned. No promo without a story attached.
            </p>
          </div>

          <div className="aside-card">
            <h4>
              <span className="chip live" style={{ padding: 0, border: 'none', background: 'none' }}></span>
              Writers Online ({onlineUsers.length})
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {onlineUsers.map((u) => {
                const isGuest = u.handle === 'Guest' || u.handle === 'Summoning...'
                const name = isGuest ? 'Guest' : `@${u.handle}`
                const avColorIndex = isGuest ? 1 : (u.handle.length % 6) + 1
                const initialsStr = isGuest ? '??' : initials(u.handle)
                return (
                  <div
                    key={u.id}
                    title={name}
                    className={`avatar ${AV_COLORS[avColorIndex]}`}
                    style={{ width: 30, height: 30, fontSize: 11 }}
                  >
                    {initialsStr}
                  </div>
                )
              })}
              {onlineUsers.length === 0 && (
                <span className="muted" style={{ fontSize: 13, fontStyle: 'italic' }}>
                  The dark is quiet.
                </span>
              )}
            </div>
          </div>
        </aside>

        <div>
          <div className="forum-tools">
            <div className="search">
              <input
                placeholder="Search threads, authors, tags…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search forum threads"
              />
            </div>
            {session ? (
              <Link to="/forum/new" className="btn blood">New Thread</Link>
            ) : (
              <span className="soon-chip">Sign in to post</span>
            )}
          </div>

          {visible.length === 0 && (
            <div className="empty">
              <p>Nothing here. The dark is quiet tonight.</p>
              {session ? (
                <Link to="/forum/new" className="btn ghost">Start the first thread</Link>
              ) : (
                <span className="soon-chip">Sign in to post</span>
              )}
            </div>
          )}

          {visible.map((t) => {
            const handle = t.profiles?.handle || 'unknown'
            const avColorIndex = (handle.length % 6) + 1
            return (
              <Link
                key={t.id}
                to={`/forum/thread/${t.id}`}
                className="thread"
                role="article"
              >
                <div className={`avatar ${AV_COLORS[avColorIndex]}`}>
                  {initials(handle)}
                </div>
                <div className="body">
                  <h4>
                    {t.pinned && <span className="pin">📌</span>}
                    {t.title}
                  </h4>
                  <div className="by">
                    <b>@{handle}</b> · {catLabels[t.category_id] || t.category_id} · {timeAgo(t.updated_at)}
                  </div>
                </div>
                <div className="replies">
                  <b>{t.replies_count || 0}</b>
                  <span>replies</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
