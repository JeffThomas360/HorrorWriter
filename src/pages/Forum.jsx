import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useAuth } from '../components/AuthContext'

import { useQuery } from '@tanstack/react-query'

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
  const { session } = useAuth()
  const [activeCat, setActiveCat] = useState('all')
  const [query, setQuery]         = useState('')
  
  const { data: categories = [], isLoading: catLoading, error: catError } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const { data: threads = [], isLoading: threadLoading, error: threadError } = useQuery({
    queryKey: ['threads'],
    queryFn: fetchThreads,
  })

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

  if (loading) return <section className="surface active"><div style={{ padding: '80px 0', textAlign: 'center' }}><p className="loading-pulse">Loading the crypt...</p></div></section>
  if (error) return <section className="surface active"><p className="error">Error loading forum: {error}</p></section>

  return (
    <section className="surface active">
      <p className="eyebrow">▸ The Forums</p>
      <h2 className="title">The <em>Crypt</em></h2>
      <p className="lede">Where the conversations live. Pick a category, or search the dark.</p>

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
                  <span className="name">{c.name}</span>
                  <span className="count">{count.toLocaleString()}</span>
                </li>
              )
            })}
          </ul>
          <div style={{ marginTop:24, padding:'18px', border:'1px dashed rgba(243,236,217,.14)', borderRadius:'var(--r)' }}>
            <div className="eyebrow" style={{ marginBottom:6, fontSize:14 }}>▸ House Rules</div>
            <p style={{ color:'var(--bone-dim)', fontSize:15, fontStyle:'italic' }}>
              Read before posting. Critique is a gift; cruelty is not.
              Spoilers warned. No promo without a story attached.
            </p>
          </div>
        </aside>

        <div>
          <div className="forum-tools">
            <div className="search">
              <input
                placeholder="search threads, authors, tags…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search forum threads"
              />
            </div>
            {session ? (
              <Link to="/forum/new" className="btn primary" style={{ height: 38, lineHeight: '36px', padding: '0 16px' }}>
                ▸ New Thread
              </Link>
            ) : (
              <span className="soon-chip">Sign in to post</span>
            )}
          </div>

          {visible.length === 0 && (
            <div style={{ padding: '60px 0', textAlign: 'center', border: '1px dashed rgba(243,236,217,.1)', borderRadius: 'var(--r)' }}>
              <p style={{ color:'var(--muted)', fontStyle:'italic', fontSize: '18px', marginBottom: '20px' }}>
                Nothing here. The dark is quiet tonight.
              </p>
              {session ? (
                <Link to="/forum/new" className="btn ghost">
                  Start the first thread
                </Link>
              ) : (
                <span className="soon-chip">Sign in to post</span>
              )}
            </div>
          )}

          {visible.map((t) => {
            const handle = t.profiles?.handle || 'unknown'
            // generate a consistent avatar color based on handle string length
            const avColorIndex = (handle.length % 6) + 1
            return (
              <Link key={t.id} to={`/forum/thread/${t.id}`} className="thread" role="article" style={{ textDecoration: 'none', color: 'inherit', display: 'grid' }}>
                <div className={`avatar ${AV_COLORS[avColorIndex]}`}>{initials(handle)}</div>
                <div className="body">
                  <h4>
                    {t.pinned && <span className="pin">📌 </span>}
                    {t.title}
                  </h4>
                  <div className="by">
                    <b>{handle}</b>&nbsp;·&nbsp;{catLabels[t.category_id] || t.category_id}
                  </div>
                </div>
                <div className="replies">
                  <b>{t.replies_count || 0}</b>
                  <span>replies</span>
                </div>
                <div className="when">
                  {timeAgo(t.updated_at)}
                  <small>by {handle}</small>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
