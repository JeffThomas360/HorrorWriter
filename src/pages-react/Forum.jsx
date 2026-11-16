import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { withProviders } from '../components/Providers'
import LoadError from '../components/LoadError'
import { authorLabel, isTombstone, TOMBSTONE_TEXT } from '../lib/storyHelpers'
import { fetchActivePrompts, fetchEntryCounts } from '../lib/ritualDraft'
import { splitPresence } from '../lib/presence'
import { getCategoryMeta, categorySidebarLabel } from '../lib/forumCategories'
import { isMod } from '../lib/moderation'

const AV_COLORS = ['', 'av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

const ROTATING_FALLBACK_PROMPTS = [
  'The astronomer realized the stars were not burning out—something vast was standing between the telescope and the sky.',
  'Every year, the village buries a carved wooden effigy of the oldest resident. This year, the wood bled.',
  'You bought a blank VHS cassette at an estate sale. The footage is from inside your bedroom, filmed last night.',
  'For three weeks, your reflection in the bathroom mirror has been blinking half a second after you do.',
  'The radio emergency broadcast system activated at 3:17 AM. It repeated only three words: Do not look.',
]

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
    .select('*, profiles(handle), ritual_prompts(id, body, goes_live_at)')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) {
    const fallback = await supabase
      .from('threads')
      .select('*, profiles(handle)')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (fallback.error) throw fallback.error
    return fallback.data || []
  }
  return data || []
}

function Forum() {
  const { session, profile } = useAuth()
  const [activeCat, setActiveCat] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return params.get('cat') || 'all'
    }
    return 'all'
  })
  const [activePromptId, setActivePromptId] = useState('all')
  const [query, setQuery] = useState('')
  const [onlineUsers, setOnlineUsers] = useState([])

  const { data: categories = [], isLoading: catLoading, error: catError, refetch: refetchCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const { data: activePrompts = [] } = useQuery({
    queryKey: ['activePrompts'],
    queryFn: () => fetchActivePrompts(5),
  })

  const { data: threads = [], isLoading: threadLoading, error: threadError, refetch: refetchThreads } = useQuery({
    queryKey: ['threads'],
    queryFn: fetchThreads,
  })

  const ritualPromptIds = useMemo(() => {
    const ids = new Set()
    activePrompts.forEach(p => { if (p?.id) ids.add(p.id) })
    threads.forEach(t => { if (t?.category_id === 'rituals' && t?.prompt_id) ids.add(t.prompt_id) })
    return Array.from(ids)
  }, [activePrompts, threads])

  const { data: entryCounts = {} } = useQuery({
    queryKey: ['ritualEntryCounts', ritualPromptIds],
    queryFn: () => fetchEntryCounts(ritualPromptIds),
    enabled: ritualPromptIds.length > 0,
  })

  // Hide the server-rendered crawler directory once the live forum mounts,
  // so human visitors don't see every thread listed twice on the page.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const ssrDir = document.getElementById('forum-ssr-directory')
    if (ssrDir) ssrDir.classList.add('hidden')
    return () => {
      if (ssrDir) ssrDir.classList.remove('hidden')
    }
  }, [])

  // Keyed on the user id and handle, not the session/profile objects:
  // AuthContext replaces those on every token refresh, and rebuilding the
  // channel each time froze presence.
  const userId = session?.user?.id
  const handle = profile?.handle
  useEffect(() => {
    if (!supabase) return
    const presenceKey = userId || 'anonymous-' + Math.random().toString(36).substr(2, 9)
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
          handle: handle || (userId ? 'Summoning...' : 'Guest'),
          online_at: new Date().toISOString(),
        })
      }
    })

    // removeChannel, not unsubscribe: a still-leaving channel left in the
    // client is handed back by the next supabase.channel() for the same topic.
    return () => { supabase.removeChannel(channel) }
  }, [userId, handle])

  const loading = catLoading || threadLoading
  const error = catError || threadError || null

  const allCategories = useMemo(() => {
    const list = [...categories]
    if (!list.some(c => c.id === 'rituals')) {
      list.unshift({
        id: 'rituals',
        name: 'Midnight Rituals · Prompts',
        description: 'Five weekly rotating prompts and user story submissions for critique.',
        sort_order: 0,
      })
    }
    return list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [categories])

  const catLabels = useMemo(() => {
    return allCategories.reduce((acc, c) => {
      acc[c.id] = getCategoryMeta(c).badgeLabel
      return acc
    }, {})
  }, [allCategories])

  const hasEntryCounts = Object.keys(entryCounts).length > 0
  const promptEntryCount = (promptId) => {
    if (promptId && entryCounts[promptId] !== undefined) return entryCounts[promptId]
    return threads.filter(t => t.category_id === 'rituals' && (promptId ? t.prompt_id === promptId : false)).length
  }
  const totalRitualCount = useMemo(() => {
    if (hasEntryCounts) {
      return Object.values(entryCounts).reduce((sum, n) => sum + (Number(n) || 0), 0)
    }
    return threads.filter(t => t.category_id === 'rituals').length
  }, [hasEntryCounts, entryCounts, threads])

  const activeCategoryObj = useMemo(
    () => allCategories.find(c => c.id === activeCat) || (activeCat !== 'all' ? { id: activeCat } : null),
    [allCategories, activeCat]
  )
  const activeCategoryMeta = useMemo(
    () => (activeCategoryObj ? getCategoryMeta(activeCategoryObj) : null),
    [activeCategoryObj]
  )
  const canPostInActiveCat = !activeCategoryMeta?.staffOnly || isMod(profile)
  const newThreadHref = activeCat !== 'all' && activeCat !== 'rituals' && canPostInActiveCat
    ? `/forum/new/?cat=${encodeURIComponent(activeCat)}`
    : '/forum/new/'

  const promptSubcategories = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const p = activePrompts[i]
      return {
        index: i,
        id: p?.id || `prompt-${i}`,
        promptId: p?.id || null,
        slotLabel: i === 0 ? 'Prompt 1 · Current Transmission' : `Prompt ${i + 1} · Week ${i + 1} of 5`,
        shortLabel: `Prompt ${i + 1}`,
        body: p?.body || ROTATING_FALLBACK_PROMPTS[i],
        goes_live_at: p?.goes_live_at,
      }
    })
  }, [activePrompts])

  // Ritual threads live in their own category, not in the general list.
  const generalThreads = useMemo(() => threads.filter(t => t.category_id !== 'rituals'), [threads])
  const { writers: writersOnline, readers: readersOnline } = splitPresence(onlineUsers)

  const visible = useMemo(() => {
    let base = activeCat === 'all' ? generalThreads : threads.filter(t => t.category_id === activeCat)
    if (activeCat === 'rituals' && activePromptId !== 'all') {
      const selectedSub = promptSubcategories.find(s => s.id === activePromptId)
      base = base.filter(t => {
        if (selectedSub?.promptId && t.prompt_id) {
          return t.prompt_id === selectedSub.promptId
        }
        return t.prompt_id === activePromptId || t.title.toLowerCase().includes(`prompt ${selectedSub ? selectedSub.index + 1 : ''}`.toLowerCase())
      })
    }
    if (!query.trim()) return base
    const q = query.toLowerCase()
    return base.filter(t => {
      const by = t.profiles?.handle || ''
      return t.title.toLowerCase().includes(q) ||
        by.toLowerCase().includes(q) ||
        (catLabels[t.category_id] || '').toLowerCase().includes(q)
    })
  }, [activeCat, activePromptId, query, threads, generalThreads, catLabels, promptSubcategories])

  if (loading) return (
    <div className="mt-8">
      <div className="border-b border-[var(--color-line)] pb-6 mb-8">
        <span className="block font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-text-secondary)] mb-2">The Forums</span>
        <h1 className="text-3xl font-serif font-black">The <em className="italic text-[var(--color-accent-crimson)] font-serif">Crypt</em> <span className="text-sm font-mono uppercase tracking-widest block text-[var(--color-text-secondary)] mt-1 font-normal">Horror Writing Workshop & Critique Forum</span></h1>
      </div>
      <div className="flex flex-col items-center justify-center min-h-[30vh]">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Entering the crypt…</p>
      </div>
    </div>
  )
  if (error) return (
    <LoadError
      title="The Crypt didn't open"
      message="We couldn't load the threads just now. Check your connection, then try again."
      error={error}
      onRetry={() => { refetchCategories(); refetchThreads() }}
    />
  )

  return (
    <div className="mt-8">
      <div className="border-b border-[var(--color-line)] pb-6 mb-8">
        <span className="block font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-text-secondary)] mb-2">The Forums</span>
        <h1 className="text-3xl font-serif font-black">The <em className="italic text-[var(--color-accent-crimson)] font-serif">Crypt</em> <span className="text-sm font-mono uppercase tracking-widest block text-[var(--color-text-secondary)] mt-1 font-normal">Horror Writing Workshop & Critique Forum</span></h1>
        <p className="text-xs text-[var(--color-text-secondary)] font-serif mt-1">Where the conversations live. Pick a category, or search the dark.</p>
      </div>

      <div className="forum-grid grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Sidebar */}
        <aside className="flex flex-col gap-6 md:col-span-1">
          {/* Category Filter */}
          <div className="vintage-card p-4">
            <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] mb-3 border-b border-[var(--color-line)] pb-2">Categories</h4>
            <ul className="flex flex-col gap-2 font-serif text-xs">
              <li
                className={`flex justify-between items-center py-1 px-2 cursor-pointer transition-colors ${'all' === activeCat ? 'bg-[var(--color-accent-crimson)] text-white font-bold' : 'hover:text-[var(--color-accent-crimson)] text-[var(--color-text-secondary)]'}`}
                onClick={() => {
                  setActiveCat('all')
                  setActivePromptId('all')
                }}
              >
                {/* Not "All Threads": Ritual threads are left out on purpose (generalThreads) and live in their own room. */}
                <span>All Discussion</span>
                <span className="font-mono text-xs">{generalThreads.length}</span>
              </li>
              {allCategories.map(c => {
                const count = c.id === 'rituals'
                  ? totalRitualCount
                  : threads.filter(t => t.category_id === c.id).length
                const isSelected = c.id === activeCat
                return (
                  <li
                    key={c.id}
                    className={`flex justify-between items-center py-1.5 px-2 cursor-pointer transition-colors ${isSelected ? 'bg-[var(--color-accent-crimson)] text-white font-bold' : 'hover:text-[var(--color-accent-crimson)] text-[var(--color-text-secondary)]'}`}
                    onClick={() => {
                      setActiveCat(c.id)
                      setActivePromptId('all')
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      {c.id === 'rituals' && <span className="text-[var(--color-upside)]">◈</span>}
                      {categorySidebarLabel(c)}
                    </span>
                    <span className="font-mono text-xs">{count.toLocaleString()}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Guidelines Block */}
          <div className="vintage-card p-4">
            <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] mb-2 border-b border-[var(--color-line)] pb-2">House Rules</h4>
            <p className="text-xs font-serif leading-relaxed text-[var(--color-text-secondary)]">
              Read before posting. Critique is a gift; cruelty is not. Spoilers warned. No promo without a story attached.
            </p>
          </div>

          {/* Users Online */}
          <div className="vintage-card p-4">
            <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] mb-3 border-b border-[var(--color-line)] pb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-ember)] animate-pulse"></span>
              Writers Online ({writersOnline.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {writersOnline.map((u) => (
                <div
                  key={u.id}
                  title={`@${u.handle}`}
                  className="w-8 h-8 rounded-full bg-[var(--color-bg-primary)] border border-[var(--color-line)] flex items-center justify-center font-mono text-xs text-[var(--color-text-secondary)] hover:border-white transition-colors"
                >
                  {initials(u.handle)}
                </div>
              ))}
              {writersOnline.length === 0 && (
                <span className="font-serif italic text-xs text-[var(--color-text-secondary)] py-2">
                  The dark is quiet.
                </span>
              )}
            </div>
            {readersOnline > 0 && (
              <p className="font-mono text-xs text-[var(--color-text-secondary)] mt-2">+ {readersOnline} reading</p>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="md:col-span-3">
          {/* Midnight Ritual Sub-Categories Selector */}
          {activeCat === 'rituals' && (
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-1.5 mb-4 border-b border-[var(--color-line)] pb-3">
                <span className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)] mr-2">
                  Prompt Sub-Categories:
                </span>
                <button
                  type="button"
                  onClick={() => setActivePromptId('all')}
                  className={`font-mono text-xs px-2.5 py-1 border transition-colors cursor-pointer ${
                    activePromptId === 'all'
                      ? 'bg-[var(--color-accent-crimson)] text-white border-[var(--color-accent-crimson)] font-bold'
                      : 'border-[var(--color-line)] text-[var(--color-text-secondary)] hover:border-white'
                  }`}
                >
                  All Prompts ({totalRitualCount})
                </button>
                {promptSubcategories.map((sub) => {
                  const count = promptEntryCount(sub.promptId)
                  const isSelected = activePromptId === sub.id
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setActivePromptId(sub.id)}
                      className={`font-mono text-xs px-2.5 py-1 border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--color-upside)] text-[var(--color-void)] border-[var(--color-upside)] font-black shadow-[0_0_10px_rgba(25,165,184,0.3)]'
                          : 'border-[var(--color-line)] text-[var(--color-text-secondary)] hover:border-white'
                      }`}
                    >
                      {sub.shortLabel} {count > 0 ? `(${count})` : ''}
                    </button>
                  )
                })}
              </div>

              {/* Highlighted Prompt Card */}
              {activePromptId !== 'all' ? (() => {
                const cur = promptSubcategories.find(s => s.id === activePromptId)
                if (!cur) return null
                const count = promptEntryCount(cur.promptId)
                return (
                  <div className="vintage-card p-5 border-l-4 border-l-[var(--color-upside)] mb-6 bg-[var(--color-void)] shadow-[0_0_20px_rgba(25,165,184,0.1)]">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-upside)] font-bold">
                        ◈ {cur.slotLabel}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--color-text-secondary)] uppercase">
                        {count} {count === 1 ? 'submission' : 'submissions'} · critiques open
                      </span>
                    </div>
                    <blockquote className="font-serif italic text-sm md:text-base text-[var(--color-text-primary)] leading-relaxed mb-4">
                      &ldquo;{cur.body}&rdquo;
                    </blockquote>
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-[var(--color-line)] text-xs font-mono">
                      <span className="text-[var(--color-text-secondary)]">Member submissions for critique below</span>
                      <a href={cur.promptId ? `/?prompt=${encodeURIComponent(cur.promptId)}#midnight-ritual` : `/#midnight-ritual`} className="text-[var(--color-upside)] hover:underline flex items-center gap-1 font-bold">
                        ⚡ Write for this prompt on front page →
                      </a>
                    </div>
                  </div>
                )
              })() : (
                <div className="vintage-card p-4 border-l-4 border-l-[var(--color-upside)] mb-6 bg-[var(--color-void)]">
                  <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-upside)] font-bold block mb-1">
                    ◈ Midnight Rituals Critique Room
                  </span>
                  <p className="font-serif italic text-xs text-[var(--color-text-secondary)]">
                    Five weekly rotating prompts live here for 5 weeks. Select any prompt sub-category above to filter submissions, or read and critique community pieces below.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Purposeful Room Banner for Non-Ritual Categories */}
          {activeCat !== 'all' && activeCat !== 'rituals' && activeCategoryMeta?.mission && (
            <div className="vintage-card p-5 border-l-4 border-l-[var(--color-accent-crimson)] mb-6 bg-[var(--color-void)]" data-testid="category-purpose-banner">
              <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-ember)] font-bold block mb-1">
                ▸ {activeCategoryMeta.fullTitle}
              </span>
              <p className="font-serif text-sm text-[var(--color-text-primary)] leading-relaxed">
                {activeCategoryMeta.mission}
              </p>
              {activeCategoryMeta.starterPrompt && (
                <p className="font-mono text-xs text-[var(--color-text-secondary)] mt-3 pt-3 border-t border-[var(--color-line)]">
                  Prompt idea: {activeCategoryMeta.starterPrompt}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className={`flex-1 min-w-0 ${threads.length === 0 ? 'hidden' : ''}`}>
              <input
                placeholder="Search threads, authors, tags…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search forum threads"
                className="w-full bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-4 py-2 text-xs font-mono focus:outline-none focus:border-[var(--color-accent-crimson)]"
              />
            </div>
            {session && canPostInActiveCat ? (
              <a href={newThreadHref} className="shrink-0 text-center bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-4 py-2 hover:bg-red-700 transition-colors">
                New Thread
              </a>
            ) : null}
          </div>

          {visible.length === 0 && (
            <div className="vintage-card text-center py-16">
              <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mb-6">
                {activeCat !== 'all' && activeCategoryMeta?.starterPrompt
                  ? activeCategoryMeta.starterPrompt
                  : 'Nothing here. The dark is quiet tonight.'}
              </p>
              {session ? (
                canPostInActiveCat ? (
                  <a href={activeCat === 'rituals' ? '/#midnight-ritual' : newThreadHref} className="border border-[var(--color-line)] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors">
                    {activeCat === 'rituals' ? '⚡ Summon the first ritual entry' : 'Start the first thread'}
                  </a>
                ) : (
                  <span className="font-mono text-xs text-[var(--color-text-secondary)] uppercase">
                    Official dispatches from the Keeper appear here
                  </span>
                )
              ) : (
                <span className="font-mono text-xs border border-[var(--color-line)] text-[var(--color-text-secondary)] px-3 py-1.5 uppercase">Sign in to post</span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-4">
            {visible.map((t) => {
              const handle = t.profiles?.handle || 'unknown'
              const isRitual = t.category_id === 'rituals'
              const ritualEntries = isRitual && t.prompt_id && entryCounts[t.prompt_id] !== undefined
                ? entryCounts[t.prompt_id]
                : null
              const rowCount = ritualEntries !== null ? ritualEntries : (t.replies_count || 0)
              const rowUnit = ritualEntries !== null
                ? (rowCount === 1 ? 'entry' : 'entries')
                : (rowCount === 1 ? 'reply' : 'replies')
              return (
                <a 
                  key={t.id}
                  href={`/forum/thread/${t.id}/`}
                  className={`vintage-card flex items-center justify-between gap-4 hover:border-[var(--color-accent-crimson)] transition-colors p-4 ${
                    isRitual ? 'border-l-2 border-l-[var(--color-upside)]' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[var(--color-bg-primary)] border border-[var(--color-line)] flex items-center justify-center font-mono text-xs text-[var(--color-text-secondary)] shrink-0">
                      {initials(handle)}
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-sm text-[var(--color-text-primary)] flex items-center gap-2 mb-1">
                        {t.pinned && <span className="text-xs" title="Pinned">📌</span>}
                        {isRitual && <span className="font-mono text-[10px] text-[var(--color-upside)] uppercase font-bold">◈ Ritual</span>}
                        {isTombstone(t) ? TOMBSTONE_TEXT : t.title}
                      </h4>
                      <div className="font-mono text-xs text-[var(--color-text-secondary)]">
                        <span className="text-[var(--color-text-primary)] font-bold mr-1">{authorLabel(t.profiles)}</span>
                        · {catLabels[t.category_id] || getCategoryMeta(t.category_id).badgeLabel} · {timeAgo(t.updated_at)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block font-mono text-sm font-bold text-[var(--color-text-primary)]">{rowCount}</span>
                    <span className="block font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">{rowUnit}</span>
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
