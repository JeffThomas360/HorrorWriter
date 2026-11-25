import { useState, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { withProviders } from '../components/Providers'
import VhsSleeveCard from '../components/VhsSleeveCard'
import LoadError from '../components/LoadError'
import ForbiddenTape from '../components/ForbiddenTape'
import { filterOneExamplePerGroup } from '../lib/storyHelpers'
import { readMinutes } from '../lib/tapeWear'
import { seriesPath } from '../lib/urls'

function Library() {
  const { session } = useAuth()
  const [feedMode, setFeedMode] = useState('all')
  const [shelfFilter, setShelfFilter] = useState('all') // 'all' | 'needs-critique' | 'quick' | 'series'
  const [groupSeries, setGroupSeries] = useState(false)

  const { data: books = [], isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['books', feedMode, session?.user?.id],
    queryFn: async () => {
      if (!supabase) return []
      
      let query = supabase
        .from('books')
        .select('*, profiles(handle), series_books(sort_order, series(id, title))')
        .eq('removed_by_author', false)
        .is('archive_author', null)
        .order('created_at', { ascending: false })

      if (feedMode === 'following' && session) {
        const { data: follows } = await supabase
          .from('user_follows')
          .select('following_id')
          .eq('follower_id', session.user.id)
        
        const authorIds = follows?.map(f => f.following_id) || []
        if (authorIds.length === 0) return [] // Following nobody
        
        query = query.in('author_id', authorIds)
      }

      const { data, error } = await query
      if (error) throw error
      return filterOneExamplePerGroup(data || [])
    }
  })

  // The public-domain classics: their own shelf, shown in every feed mode.
  const { data: archives = [] } = useQuery({
    queryKey: ['archive_books'],
    queryFn: async () => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .not('archive_author', 'is', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    }
  })

  const error = queryError || null

  // Count how many parts each series has on the shelf so series links can show total volumes.
  const seriesPartCounts = useMemo(() => {
    const counts = {}
    for (const b of books) {
      const sId = b?.series_books?.[0]?.series?.id
      if (sId) counts[sId] = (counts[sId] || 0) + 1
    }
    return counts
  }, [books])

  const hasMultiPartSeries = useMemo(
    () => Object.values(seriesPartCounts).some((n) => n > 1),
    [seriesPartCounts]
  )

  const filteredBooks = useMemo(() => {
    let list = books
    if (shelfFilter === 'needs-critique') {
      list = list.filter((b) => (b.comments_count || 0) === 0)
    } else if (shelfFilter === 'quick') {
      list = list.filter((b) => {
        const m = readMinutes(b.content)
        return m !== null && m <= 10
      })
    } else if (shelfFilter === 'series') {
      list = list.filter((b) => Boolean(b?.series_books?.[0]?.series?.id))
    }

    if (groupSeries || shelfFilter === 'series') {
      // When grouping series, keep only the first volume (lowest sort_order) per series
      const seenSeries = new Set()
      const sortedForSeries = [...list].sort((a, b) => {
        const sa = a?.series_books?.[0]?.sort_order ?? 0
        const sb = b?.series_books?.[0]?.sort_order ?? 0
        return sa - sb
      })
      const leadIds = new Set()
      for (const b of sortedForSeries) {
        const sId = b?.series_books?.[0]?.series?.id
        if (sId) {
          if (!seenSeries.has(sId)) {
            seenSeries.add(sId)
            leadIds.add(b.id)
          }
        } else {
          leadIds.add(b.id)
        }
      }
      if (groupSeries) {
        list = list.filter((b) => leadIds.has(b.id))
      }
    }

    return list
  }, [books, shelfFilter, groupSeries])

  return (
    <div className="mt-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-[var(--color-line)] pb-6">
        <div>
          <span className="block font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-text-secondary)] mb-2">The Library</span>
          <h1 className="text-3xl font-serif font-black">The <em className="italic text-[var(--color-accent-crimson)] font-serif">Library</em> <span className="text-sm font-mono uppercase tracking-widest block text-[var(--color-text-secondary)] mt-1 font-normal">Horror Fiction, Stories & Archives</span></h1>
          <p className="text-xs text-[var(--color-text-secondary)] font-serif mt-1">Excerpts, shorts, and chapters left in the dark for others to find.</p>
        </div>
        {session ? (
          <div className="flex items-center gap-3">
            <a href="/my-stories/" className="border border-[var(--color-line)] text-[var(--color-text-primary)] font-mono text-xs uppercase px-5 py-3 hover:border-white transition-colors inline-block text-center">
              My Stories
            </a>
            <a href="/library/publish/" className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-5 py-3 hover:bg-red-700 transition-colors inline-block text-center">
              Publish a Story
            </a>
          </div>
        ) : (
          <span className="font-mono text-xs border border-[var(--color-line)] text-[var(--color-text-secondary)] px-3 py-1.5 uppercase">Sign in to publish</span>
        )}
      </div>

      {/* Discovery & Shelf Filter Bar — visible to all visitors */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8" role="toolbar" aria-label="Filter stories">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`font-mono text-xs uppercase px-3.5 py-2 border cursor-pointer transition-colors ${feedMode === 'all' && shelfFilter === 'all' ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] border-[var(--color-text-primary)] font-bold' : 'border-[var(--color-line)] text-[var(--color-text-primary)] hover:border-white'}`}
            onClick={() => { setFeedMode('all'); setShelfFilter('all') }}
          >
            All Stories
          </button>
          <button
            type="button"
            className={`font-mono text-xs uppercase px-3.5 py-2 border cursor-pointer transition-colors ${shelfFilter === 'needs-critique' ? 'bg-[var(--color-upside)] text-[var(--color-void)] border-[var(--color-upside)] font-bold' : 'border-[var(--color-line)] text-[var(--color-text-primary)] hover:border-white'}`}
            onClick={() => setShelfFilter(shelfFilter === 'needs-critique' ? 'all' : 'needs-critique')}
          >
            Needs First Critique
          </button>
          <button
            type="button"
            className={`font-mono text-xs uppercase px-3.5 py-2 border cursor-pointer transition-colors ${shelfFilter === 'quick' ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] border-[var(--color-text-primary)] font-bold' : 'border-[var(--color-line)] text-[var(--color-text-primary)] hover:border-white'}`}
            onClick={() => setShelfFilter(shelfFilter === 'quick' ? 'all' : 'quick')}
          >
            Quick Reads (≤ 10m)
          </button>
          <button
            type="button"
            className={`font-mono text-xs uppercase px-3.5 py-2 border cursor-pointer transition-colors ${shelfFilter === 'series' ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] border-[var(--color-text-primary)] font-bold' : 'border-[var(--color-line)] text-[var(--color-text-primary)] hover:border-white'}`}
            onClick={() => setShelfFilter(shelfFilter === 'series' ? 'all' : 'series')}
          >
            Series
          </button>
          {session && (
            <button
              type="button"
              className={`font-mono text-xs uppercase px-3.5 py-2 border cursor-pointer transition-colors ${feedMode === 'following' ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] border-[var(--color-text-primary)] font-bold' : 'border-[var(--color-line)] text-[var(--color-text-primary)] hover:border-white'}`}
              onClick={() => setFeedMode(feedMode === 'following' ? 'all' : 'following')}
            >
              My Feed
            </button>
          )}
        </div>

        {hasMultiPartSeries && (
          <button
            type="button"
            aria-pressed={groupSeries}
            onClick={() => setGroupSeries((g) => !g)}
            className={`font-mono text-[11px] uppercase px-3 py-1.5 border cursor-pointer transition-colors ${groupSeries ? 'border-[var(--color-upside)] text-[var(--color-upside)] bg-[var(--color-upside)]/10' : 'border-[var(--color-line)] text-[var(--color-text-secondary)] hover:border-white'}`}
          >
            {groupSeries ? '✓ Series Collapsed (1 per series)' : 'Collapse Series'}
          </button>
        )}
      </div>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="animate-pulse flex flex-col gap-4">
              <div className="w-full aspect-[4/5] bg-neutral-900 border border-[var(--color-line)]" />
              <div className="w-1/3 h-3 bg-neutral-900 mt-2" />
              <div className="w-3/4 h-5 bg-neutral-900" />
              <div className="w-full h-12 bg-neutral-900" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-8">
          <LoadError
            title="The shelves are dark"
            message="We couldn't load the stories just now. Check your connection, then try again."
            error={error}
            onRetry={() => refetch()}
          />
        </div>
      )}

      {!loading && !error && books.length === 0 && (
        <div className="vintage-card py-12 text-center mb-12">
          <p className="font-serif italic text-base text-[var(--color-text-primary)] mb-2">No community stories published yet.</p>
          <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mb-6">Be the first writer to place your tape on the shelf.</p>
          {session ? (
            <a href="/library/publish/" className="bg-[var(--color-blood)] hover:bg-red-800 text-white font-mono text-xs uppercase px-5 py-3 transition-colors inline-block">
              Publish the First Story
            </a>
          ) : (
            <span className="font-mono text-xs border border-[var(--color-line)] text-[var(--color-text-secondary)] px-4 py-2 uppercase">Sign in to publish your tape</span>
          )}
        </div>
      )}

      {!loading && !error && books.length > 0 && (
        <div className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)]">Community Tapes</span>
            <span className="font-mono text-xs text-[var(--color-text-secondary)]">{filteredBooks.length} {filteredBooks.length === 1 ? 'story' : 'stories'}</span>
          </div>
          {filteredBooks.length === 0 ? (
            <div className="vintage-card py-10 text-center">
              <p className="font-serif italic text-sm text-[var(--color-text-secondary)] mb-4">No stories match this filter right now.</p>
              <button
                type="button"
                onClick={() => { setShelfFilter('all'); setGroupSeries(false) }}
                className="border border-[var(--color-line)] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors cursor-pointer"
              >
                Show All Stories
              </button>
            </div>
          ) : (
            /* Two-up on phones: one-up made every tape about a full screen tall. */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {filteredBooks.map((b) => {
                const seriesObj = b?.series_books?.[0]?.series
                const totalInSeries = seriesObj?.id ? (seriesPartCounts[seriesObj.id] || 1) : 0
                return (
                  <div key={b.id} className="flex flex-col gap-1.5">
                    <VhsSleeveCard story={b} />
                    {seriesObj?.id && (
                      <a
                        href={seriesPath(seriesObj.id)}
                        className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-upside)] hover:underline truncate px-1"
                        title={`View all parts in ${seriesObj.title}`}
                      >
                        ◈ {seriesObj.title}{totalInSeries > 1 ? ` (${totalInSeries} parts)` : ''} →
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* The Archives — Pre-seeded showcase masterworks explicitly flagged as artificial */}
      {!loading && !error && (
        <div className="mt-12 pt-8 border-t border-[var(--color-line)]">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
            <div>
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-upside)] block mb-1">
                The Archives • Public Domain Classics
              </span>
              <h3 className="text-xl font-serif font-black text-[var(--color-text-primary)]">
                Public Domain <em className="italic text-[var(--color-ember)] font-serif">Masterworks</em>
              </h3>
            </div>
            <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
              Not member submissions
            </span>
          </div>

          <div className="p-3.5 mb-6 border border-[var(--color-upside)]/30 bg-[var(--color-upside)]/5 font-mono text-[11px] text-[var(--color-text-secondary)] flex items-center gap-3">
            <span className="text-base">📼</span>
            <span>
              These public-domain classics are not member submissions. Read them in full, and critique them like any other story.
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {archives.map((story) => (
              <VhsSleeveCard key={story.id} story={story} />
            ))}
          </div>

          {/* Forbidden Tape #00 Curiosity Hook */}
          <ForbiddenTape />
        </div>
      )}
    </div>
  )
}

export default withProviders(Library)
