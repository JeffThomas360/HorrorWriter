import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../components/AuthContext'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export default function Moderation() {
  useDocumentTitle('Keeper Terminal')
  const { profile, isLoading: authLoading } = useAuth()
  const [tab, setTab] = useState('flags')
  const [flags, setFlags] = useState([])
  const [targetDetails, setTargetDetails] = useState({})
  const [screeningQueue, setScreeningQueue] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // 1. Authorization Gate
  const isAuthorized = !authLoading && profile?.is_admin

  // Fetch flags on load or tab change
  const fetchFlags = async () => {
    if (!supabase || !isAuthorized) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('moderation_flags')
        .select('*, profiles:reporter_id(handle)')
        .order('created_at', { ascending: false })
      if (error) throw error
      setFlags(data || [])
      
      // Load target details for human-readable display
      if (data && data.length > 0) {
        const details = await loadTargetDetails(data)
        setTargetDetails(prev => ({ ...prev, ...details }))
      }
    } catch (err) {
      console.error('Failed to fetch flags:', err)
      setMessage('Error loading flags.')
    } finally {
      setLoading(false)
    }
  }

  // Helper to load flagged target text & author
  const loadTargetDetails = async (flagsList) => {
    const details = {}
    for (const flag of flagsList) {
      const { target_type, target_id } = flag
      const key = `${target_type}-${target_id}`
      if (details[key]) continue

      try {
        if (target_type === 'story') {
          const { data } = await supabase
            .from('books')
            .select('title, author_id, profiles:author_id(handle)')
            .eq('id', target_id)
            .maybeSingle()
          if (data) {
            details[key] = {
              title: data.title,
              author: data.profiles?.handle,
              link: `/library/read/${target_id}`
            }
          }
        } else if (target_type === 'critique') {
          const { data } = await supabase
            .from('book_comments')
            .select('content, book_id, author_id, profiles:author_id(handle)')
            .eq('id', target_id)
            .maybeSingle()
          if (data) {
            details[key] = {
              title: `Critique: "${data.content.slice(0, 50)}${data.content.length > 50 ? '...' : ''}"`,
              author: data.profiles?.handle,
              link: `/library/read/${data.book_id}`
            }
          }
        } else if (target_type === 'thread') {
          const { data } = await supabase
            .from('threads')
            .select('title, author_id, profiles:author_id(handle)')
            .eq('id', target_id)
            .maybeSingle()
          if (data) {
            details[key] = {
              title: data.title,
              author: data.profiles?.handle,
              link: `/forum/thread/${target_id}`
            }
          }
        } else if (target_type === 'post') {
          const { data } = await supabase
            .from('posts')
            .select('content, thread_id, author_id, profiles:author_id(handle)')
            .eq('id', target_id)
            .maybeSingle()
          if (data) {
            details[key] = {
              title: `Post: "${data.content.slice(0, 50)}${data.content.length > 50 ? '...' : ''}"`,
              author: data.profiles?.handle,
              link: `/forum/thread/${data.thread_id}`
            }
          }
        }
      } catch (err) {
        console.error(`Error loading target details for ${key}:`, err)
      }
    }
    return details
  }

  // Fetch Screening Queue
  const fetchScreeningQueue = async () => {
    if (!supabase || !isAuthorized) return
    setLoading(true)
    try {
      const [booksRes, commentsRes, threadsRes, postsRes] = await Promise.all([
        supabase.from('books').select('id, title, created_at, profiles:author_id(handle)').eq('approved', false).eq('hidden', false),
        supabase.from('book_comments').select('id, content, book_id, created_at, profiles:author_id(handle)').eq('approved', false).eq('hidden', false),
        supabase.from('threads').select('id, title, created_at, profiles:author_id(handle)').eq('approved', false).eq('hidden', false),
        supabase.from('posts').select('id, content, thread_id, created_at, profiles:author_id(handle)').eq('approved', false).eq('hidden', false)
      ])

      const list = []
      if (booksRes.data) {
        booksRes.data.forEach(x => list.push({
          id: x.id,
          type: 'story',
          title: x.title,
          author: x.profiles?.handle,
          created_at: x.created_at,
          link: `/library/read/${x.id}`
        }))
      }
      if (commentsRes.data) {
        commentsRes.data.forEach(x => list.push({
          id: x.id,
          type: 'critique',
          title: `Critique: "${x.content.slice(0, 50)}${x.content.length > 50 ? '...' : ''}"`,
          author: x.profiles?.handle,
          created_at: x.created_at,
          link: `/library/read/${x.book_id}`
        }))
      }
      if (threadsRes.data) {
        threadsRes.data.forEach(x => list.push({
          id: x.id,
          type: 'thread',
          title: x.title,
          author: x.profiles?.handle,
          created_at: x.created_at,
          link: `/forum/thread/${x.id}`
        }))
      }
      if (postsRes.data) {
        postsRes.data.forEach(x => list.push({
          id: x.id,
          type: 'post',
          title: `Post: "${x.content.slice(0, 50)}${x.content.length > 50 ? '...' : ''}"`,
          author: x.profiles?.handle,
          created_at: x.created_at,
          link: `/forum/thread/${x.thread_id}`
        }))
      }

      // Sort by oldest first so we clear queue sequentially
      list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      setScreeningQueue(list)
    } catch (err) {
      console.error('Failed to load screening queue:', err)
      setMessage('Error loading screening queue.')
    } finally {
      setLoading(false)
    }
  }

  // Search profiles
  const searchUsers = async (e) => {
    if (e) e.preventDefault()
    if (!supabase || !isAuthorized || !userSearch.trim()) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, handle, display_name, is_admin, is_shadowbanned, requires_screening')
        .ilike('handle', `%${userSearch.trim()}%`)
        .limit(20)
      if (error) throw error
      setSearchResults(data || [])
    } catch (err) {
      console.error('Failed to search users:', err)
      setMessage('Error searching profiles.')
    } finally {
      setLoading(false)
    }
  }

  // Action: Dismiss flag
  const handleDismissFlag = async (flagId) => {
    if (!supabase) return
    try {
      const { error } = await supabase
        .from('moderation_flags')
        .delete()
        .eq('id', flagId)
      if (error) throw error
      setFlags(prev => prev.filter(f => f.id !== flagId))
      setMessage('Flag dismissed.')
    } catch (err) {
      alert(err.message || 'Failed to dismiss flag.')
    }
  }

  // Action: Hide content (soft delete/moderated)
  const handleHideContent = async (targetType, targetId, flagId) => {
    if (!supabase) return
    try {
      const tableName = targetType === 'story' ? 'books' 
                      : targetType === 'critique' ? 'book_comments'
                      : targetType === 'thread' ? 'threads'
                      : 'posts'

      // Set hidden = true
      const { error: updateErr } = await supabase
        .from(tableName)
        .update({ hidden: true })
        .eq('id', targetId)
      if (updateErr) throw updateErr

      // Clean up the flag
      if (flagId) {
        await supabase.from('moderation_flags').delete().eq('id', flagId)
      } else {
        // Clean all flags for this target
        await supabase.from('moderation_flags').delete().eq('target_type', targetType).eq('target_id', targetId)
      }

      setFlags(prev => prev.filter(f => !(f.target_type === targetType && f.target_id === targetId)))
      setScreeningQueue(prev => prev.filter(item => item.id !== targetId))
      setMessage('Content hidden successfully.')
    } catch (err) {
      alert(err.message || 'Failed to hide content.')
    }
  }

  // Action: Approve screened content
  const handleApproveContent = async (targetType, targetId) => {
    if (!supabase) return
    try {
      const tableName = targetType === 'story' ? 'books' 
                      : targetType === 'critique' ? 'book_comments'
                      : targetType === 'thread' ? 'threads'
                      : 'posts'

      const { error } = await supabase
        .from(tableName)
        .update({ approved: true })
        .eq('id', targetId)
      if (error) throw error

      setScreeningQueue(prev => prev.filter(item => item.id !== targetId))
      setMessage('Content approved and made public.')
    } catch (err) {
      alert(err.message || 'Failed to approve content.')
    }
  }

  // Action: Toggle User Shadowban
  const handleToggleShadowban = async (user) => {
    if (!supabase) return
    const nextVal = !user.is_shadowbanned
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_shadowbanned: nextVal })
        .eq('id', user.id)
      if (error) throw error

      setSearchResults(prev => prev.map(u => u.id === user.id ? { ...u, is_shadowbanned: nextVal } : u))
      setMessage(`User @${user.handle} shadowban ${nextVal ? 'activated' : 'removed'}.`)
    } catch (err) {
      alert(err.message || 'Failed to toggle shadowban.')
    }
  }

  // Action: Toggle User Screening
  const handleToggleScreening = async (user) => {
    if (!supabase) return
    const nextVal = !user.requires_screening
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ requires_screening: nextVal })
        .eq('id', user.id)
      if (error) throw error

      setSearchResults(prev => prev.map(u => u.id === user.id ? { ...u, requires_screening: nextVal } : u))
      setMessage(`User @${user.handle} screening requirement ${nextVal ? 'activated' : 'removed'}.`)
    } catch (err) {
      alert(err.message || 'Failed to toggle screening.')
    }
  }

  // Trigger loading depending on tab
  useEffect(() => {
    if (isAuthorized) {
      if (tab === 'flags') fetchFlags()
      else if (tab === 'screening') fetchScreeningQueue()
    }
  }, [tab, authLoading])

  // 1a. If auth is loading, render simple loader
  if (authLoading) {
    return (
      <section className="surface active" style={{ maxWidth: 820, margin: '0 auto' }}>
        <p className="eyebrow">▸ Establishing secure channel…</p>
      </section>
    )
  }

  // 2. Secret Gate - Render simulated 404 for unauthorized access
  if (!isAuthorized) {
    return (
      <section className="surface active" style={{ textAlign: 'center', padding: '120px 24px', maxWidth: 'var(--prose-w)', margin: '0 auto' }}>
        <h1 className="title" style={{ fontSize: '4.5rem', color: 'var(--blood)', marginBottom: 20, fontFamily: 'var(--mono)' }}>404</h1>
        <p className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '0.9rem' }}>Page Not Found</p>
        <p style={{ color: 'var(--muted)', marginTop: 24, fontStyle: 'italic', fontSize: '1.1rem' }}>
          The path you seek has been swallowed by the dark.
        </p>
      </section>
    )
  }

  return (
    <section className="surface active" style={{ maxWidth: 880, margin: '0 auto' }}>
      <p className="eyebrow" style={{ color: 'var(--blood)' }}>▸ Coven Master Console</p>
      <h1 className="title" style={{ fontSize: 'clamp(28px, 4vw, 42px)', textShadow: '0 0 10px rgba(230,57,70,0.3)', marginBottom: 8 }}>
        KEEPER TERMINAL
      </h1>
      <p className="lede" style={{ marginBottom: 32, fontSize: '0.95rem', color: 'var(--bone-soft)' }}>
        Invisible policing interface. Restrict, screen, and audit content and profiles from the void.
      </p>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32, borderBottom: '1px solid var(--line)', paddingBottom: 16 }}>
        <button 
          onClick={() => setTab('flags')} 
          style={{ 
            fontFamily: 'var(--mono)', 
            fontSize: '0.9rem',
            borderBottom: tab === 'flags' ? '2px solid var(--blood)' : 'none', 
            color: tab === 'flags' ? 'var(--paper)' : 'var(--bone-soft)', 
            paddingBottom: 8,
            cursor: 'pointer'
          }}
          className="tab-flags-btn"
        >
          [Flagged Queue ({flags.length})]
        </button>
        <button 
          onClick={() => setTab('screening')} 
          style={{ 
            fontFamily: 'var(--mono)', 
            fontSize: '0.9rem',
            borderBottom: tab === 'screening' ? '2px solid var(--blood)' : 'none', 
            color: tab === 'screening' ? 'var(--paper)' : 'var(--bone-soft)', 
            paddingBottom: 8,
            cursor: 'pointer'
          }}
          className="tab-screening-btn"
        >
          [Screening Queue ({screeningQueue.length})]
        </button>
        <button 
          onClick={() => setTab('users')} 
          style={{ 
            fontFamily: 'var(--mono)', 
            fontSize: '0.9rem',
            borderBottom: tab === 'users' ? '2px solid var(--blood)' : 'none', 
            color: tab === 'users' ? 'var(--paper)' : 'var(--bone-soft)', 
            paddingBottom: 8,
            cursor: 'pointer'
          }}
          className="tab-users-btn"
        >
          [Coven Registry]
        </button>
      </div>

      {/* Feedback Alert Bar */}
      {message && (
        <div style={{ padding: '10px 16px', background: 'var(--ink-rise)', borderLeft: '3px solid var(--cyan)', marginBottom: 24, fontSize: '0.85rem', fontFamily: 'var(--mono)' }}>
          ▸ {message}
        </div>
      )}

      {loading && <p style={{ fontFamily: 'var(--mono)', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 20 }}>▸ Fetching records from the crypt…</p>}

      {/* ── TAB 1: FLAGGED QUEUE ── */}
      {tab === 'flags' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {flags.length === 0 ? (
            <p style={{ fontStyle: 'italic', color: 'var(--muted)' }}>No active flags. The circle is quiet.</p>
          ) : (
            flags.map(f => {
              const target = targetDetails[`${f.target_type}-${f.target_id}`]
              return (
                <div key={f.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, fontSize: '0.85rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    <span>TYPE: {f.target_type.toUpperCase()}</span>
                    <span>FLAGGED BY: @{f.profiles?.handle || 'unknown'}</span>
                  </div>
                  
                  {target ? (
                    <div style={{ padding: '10px 16px', background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
                      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 4 }}>AUTHOR: @{target.author || 'unknown'}</p>
                      <Link to={target.link} style={{ color: 'var(--cyan)', textDecoration: 'underline', fontWeight: 'bold' }} target="_blank">
                        {target.title}
                      </Link>
                    </div>
                  ) : (
                    <div style={{ padding: '10px 16px', background: 'var(--ink-2)', color: 'var(--muted)', fontSize: '0.85rem', border: '1px dashed var(--line)' }}>
                      ID: {f.target_id} (Content might have been deleted)
                    </div>
                  )}

                  <p style={{ fontSize: '1rem', fontStyle: 'italic' }}>
                    Reason: "{f.reason || 'No reason provided'}"
                  </p>

                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button 
                      onClick={() => handleDismissFlag(f.id)} 
                      className="btn ghost small"
                      style={{ fontSize: '0.8rem', padding: '6px 12px', borderColor: 'var(--line-strong)' }}
                    >
                      Dismiss Flag
                    </button>
                    <button 
                      onClick={() => handleHideContent(f.target_type, f.target_id, f.id)} 
                      className="btn danger small"
                      style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'var(--blood)' }}
                    >
                      Moderate (Hide)
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── TAB 2: SCREENING QUEUE ── */}
      {tab === 'screening' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {screeningQueue.length === 0 ? (
            <p style={{ fontStyle: 'italic', color: 'var(--muted)' }}>Screening queue is empty. All content approved.</p>
          ) : (
            screeningQueue.map(item => (
              <div key={item.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, fontSize: '0.85rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  <span>TYPE: {item.type.toUpperCase()}</span>
                  <span>SUBMITTED: {new Date(item.created_at).toLocaleString()}</span>
                </div>

                <div style={{ padding: '12px 16px', background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 4 }}>AUTHOR: @{item.author || 'unknown'}</p>
                  <Link to={item.link} style={{ color: 'var(--cyan)', textDecoration: 'underline', fontWeight: 'bold' }} target="_blank">
                    {item.title}
                  </Link>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button 
                    onClick={() => handleApproveContent(item.type, item.id)} 
                    className="btn primary small approve-btn"
                    style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'var(--cyan)', color: 'var(--ink)' }}
                  >
                    Approve Content
                  </button>
                  <button 
                    onClick={() => handleHideContent(item.type, item.id, null)} 
                    className="btn danger small hide-btn"
                    style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'var(--blood)' }}
                  >
                    Reject (Hide)
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB 3: COVEN REGISTRY ── */}
      {tab === 'users' && (
        <div>
          <form onSubmit={searchUsers} style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
            <input 
              type="text" 
              placeholder="Search handle (e.g. testwriter)" 
              value={userSearch} 
              onChange={e => setUserSearch(e.target.value)}
              style={{ 
                flex: 1, 
                background: 'var(--ink-2)', 
                border: '1px solid var(--line-strong)', 
                color: 'var(--paper)', 
                padding: '10px 16px', 
                fontFamily: 'var(--mono)', 
                fontSize: '0.9rem',
                borderRadius: 'var(--r)'
              }}
              className="user-search-input"
            />
            <button type="submit" className="btn primary" style={{ fontFamily: 'var(--mono)', padding: '10px 20px' }}>
              Search
            </button>
          </form>

          {!loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {searchResults.length === 0 ? (
                <p style={{ fontStyle: 'italic', color: 'var(--muted)' }}>Enter a user handle above to audit their permissions.</p>
              ) : (
                searchResults.map(user => (
                  <div key={user.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                      <h4 style={{ fontFamily: 'var(--serif)', fontSize: '1.2rem', color: 'var(--paper)' }}>
                        @{user.handle} {user.display_name && <small style={{ color: 'var(--bone-soft)', fontSize: '0.85rem', fontStyle: 'italic' }}>({user.display_name})</small>}
                      </h4>
                      
                      {/* Permissions Status row */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {user.is_admin && (
                          <span style={{ fontSize: '0.7rem', background: 'var(--cyan)', color: 'var(--ink)', padding: '2px 6px', borderRadius: 'var(--r)', fontFamily: 'var(--mono)' }}>
                            ADMIN
                          </span>
                        )}
                        {user.is_shadowbanned && (
                          <span style={{ fontSize: '0.7rem', background: 'var(--blood)', color: '#fff', padding: '2px 6px', borderRadius: 'var(--r)', fontFamily: 'var(--mono)' }} className="shadowbanned-badge">
                            SHADOWBANNED
                          </span>
                        )}
                        {user.requires_screening && (
                          <span style={{ fontSize: '0.7rem', background: 'var(--gold)', color: 'var(--ink)', padding: '2px 6px', borderRadius: 'var(--r)', fontFamily: 'var(--mono)' }} className="screening-badge">
                            SCREENING ACTIVE
                          </span>
                        )}
                        {!user.is_shadowbanned && !user.requires_screening && (
                          <span style={{ fontSize: '0.7rem', background: 'var(--line-strong)', color: 'var(--bone-soft)', padding: '2px 6px', borderRadius: 'var(--r)', fontFamily: 'var(--mono)' }}>
                            CLEAN STANDING
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button 
                        onClick={() => handleToggleShadowban(user)} 
                        className="btn small shadowban-toggle-btn"
                        style={{ 
                          fontSize: '0.8rem', 
                          padding: '6px 12px', 
                          background: user.is_shadowbanned ? 'var(--line-strong)' : 'var(--blood)', 
                          color: '#fff',
                          fontFamily: 'var(--mono)'
                        }}
                      >
                        {user.is_shadowbanned ? 'Un-Shadowban' : 'Shadowban'}
                      </button>
                      <button 
                        onClick={() => handleToggleScreening(user)} 
                        className="btn small screening-toggle-btn"
                        style={{ 
                          fontSize: '0.8rem', 
                          padding: '6px 12px', 
                          background: user.requires_screening ? 'var(--line-strong)' : 'var(--gold)', 
                          color: 'var(--ink)',
                          fontFamily: 'var(--mono)'
                        }}
                      >
                        {user.requires_screening ? 'Disable Screening' : 'Enable Screening'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
