import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { withProviders } from '../components/Providers'
import VhsSleeveCard from '../components/VhsSleeveCard'

const COVER_SVG = (
  <svg viewBox="0 0 260 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full h-full text-white/20">
    <line x1="0" y1="160" x2="260" y2="160" stroke="currentColor" strokeWidth="1" opacity=".35" />
    <line x1="130" y1="0" x2="130" y2="320" stroke="currentColor" strokeWidth="1" opacity=".35" />
    <circle cx="130" cy="160" r="64" fill="none" stroke="currentColor" strokeWidth="1" opacity=".28" />
    <circle cx="130" cy="160" r="32" fill="none" stroke="currentColor" strokeWidth="1" opacity=".2" />
  </svg>
)

function postedAgo(dateString) {
  if (!dateString) return null
  const d = new Date(dateString)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return `${Math.floor(diffMonths / 12)}y ago`
}

function Library() {
  const { session } = useAuth()
  const [feedMode, setFeedMode] = useState('all')

  const { data: books = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['books', feedMode, session?.user?.id],
    queryFn: async () => {
      if (!supabase) return []
      
      let query = supabase
        .from('books')
        .select('*, profiles(handle), series_books(sort_order, series(id, title))')
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
      return data || []
    }
  })

  const error = queryError ? queryError.message : null

  return (
    <div className="mt-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-[var(--color-line)] pb-6">
        <div>
          <span className="block font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-text-secondary)] mb-2">The Library</span>
          <h2 className="text-3xl font-serif font-black">Shared <em className="italic text-[var(--color-accent-crimson)] font-serif">work</em></h2>
          <p className="text-xs text-[var(--color-text-secondary)] font-serif mt-1">Excerpts, shorts, and chapters left in the dark for others to find.</p>
        </div>
        {session ? (
          <div className="flex items-center gap-3">
            <a href="/my-stories" className="border border-[var(--color-line)] text-[var(--color-text-primary)] font-mono text-xs uppercase px-5 py-3 hover:border-white transition-colors inline-block text-center">
              My Stories
            </a>
            <a href="/library/publish" className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-5 py-3 hover:bg-red-700 transition-colors inline-block text-center">
              Publish a Story
            </a>
          </div>
        ) : (
          <span className="font-mono text-xs border border-[var(--color-line)] text-[var(--color-text-secondary)] px-3 py-1.5 uppercase">Sign in to publish</span>
        )}
      </div>

      {session && (
        <div className="flex gap-4 mb-8">
          <button 
            className={`font-mono text-xs uppercase px-4 py-2 border cursor-pointer ${feedMode === 'all' ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] border-[var(--color-text-primary)]' : 'border-[var(--color-line)] text-[var(--color-text-primary)] hover:border-white'}`} 
            onClick={() => setFeedMode('all')}
          >
            All Stories
          </button>
          <button 
            className={`font-mono text-xs uppercase px-4 py-2 border cursor-pointer ${feedMode === 'following' ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] border-[var(--color-text-primary)]' : 'border-[var(--color-line)] text-[var(--color-text-primary)] hover:border-white'}`} 
            onClick={() => setFeedMode('following')}
          >
            My Feed
          </button>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
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
        <div className="vintage-card border-red-950 text-[var(--color-accent-crimson)] font-mono text-xs py-4 mb-8">
          Error loading library: {error}
        </div>
      )}

      {!loading && !error && books.length === 0 && (
        <div className="vintage-card py-16 text-center">
          <p className="font-serif italic text-sm text-[var(--color-text-secondary)] mb-6">The library is currently empty.</p>
          {session ? (
            <a href="/library/publish" className="border border-[var(--color-line)] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors">
              Publish the first story
            </a>
          ) : (
            <span className="font-mono text-xs border border-[var(--color-line)] text-[var(--color-text-secondary)] px-3 py-1.5 uppercase">Sign in to publish</span>
          )}
        </div>
      )}

      {!loading && !error && books.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {books.map((b) => (
            <VhsSleeveCard key={b.id} story={b} />
          ))}
        </div>
      )}
    </div>
  )
}

export default withProviders(Library)
