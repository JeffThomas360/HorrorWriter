import { useEffect, useState } from 'react'
import { fetchSeriesWithBooks } from '../lib/series'
import { readMinutes } from '../lib/tapeWear'
import { withProviders } from '../components/Providers'

function formatPublishedDate(dateString) {
  if (!dateString) return 'Published'
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return 'Published'
  return `Published ${d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })}`
}

function SeriesHub({ seriesId }) {
  const [series, setSeries] = useState(null)
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchSeriesWithBooks(seriesId)
        if (result) {
          setSeries(result.series)
          setBooks(result.books)
        } else {
          setError('Series not found')
        }
      } catch (err) {
        console.error('Error loading series:', err)
        setError('Failed to load series')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [seriesId])

  if (loading) {
    return (
      <div className="py-12 font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">
        Loading series...
      </div>
    )
  }

  if (error) {
    return (
      <div className="vintage-card p-8 border-[var(--color-blood)] text-[var(--color-blood)] font-mono text-sm">
        Error: {error}
      </div>
    )
  }

  if (!series) {
    return <div className="py-12 text-[var(--color-bone)]">Series not found</div>
  }

  return (
    <div className="text-[var(--color-bone)] max-w-3xl mx-auto mt-6">
      {/* Header Section */}
      <section className="mb-10 pb-8 border-b border-[var(--color-line)]">
        <a
          href="/library/"
          className="inline-block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ash)] hover:text-[var(--color-ember)] mb-4 transition-colors"
        >
          ← Back to the Library
        </a>
        <h1 className="font-serif font-black text-3xl sm:text-5xl text-[var(--color-bone)] mb-2 leading-tight">
          {series.title}
        </h1>
        {series.profiles?.handle && (
          <p className="font-mono text-xs text-[var(--color-ash)] mb-4">
            A series by{' '}
            <a href={`/u/${series.profiles.handle}/`} className="text-[var(--color-bone)] hover:text-[var(--color-ember)] underline">
              @{series.profiles.handle}
            </a>
          </p>
        )}
        {series.description && (
          <p className="font-serif italic text-base text-[var(--color-bone)]/90 mb-4 leading-relaxed">
            {series.description}
          </p>
        )}
        <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-upside)]">
          {books.length} {books.length === 1 ? 'Story' : 'Stories'}
        </p>
      </section>

      {/* Books List */}
      <section className="flex flex-col gap-6">
        {books.map((book, idx) => {
          const mins = readMinutes(book.content)
          const critiques = Number(book.comments_count) || 0
          return (
            <div
              key={book.id}
              className="vintage-card p-6 border border-[var(--color-line)] bg-[var(--color-surface)] flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-2xl font-bold text-[var(--color-blood)]">
                  ▶ {idx + 1}
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-upside)] border border-[var(--color-upside)]/40 px-2 py-0.5">
                  Vol {idx + 1} of {books.length}
                </span>
              </div>

              <h2 className="font-serif font-bold text-xl sm:text-2xl text-[var(--color-bone)]">
                {book.title}
              </h2>

              <p className="font-serif text-sm sm:text-base text-[var(--color-bone)]/90 leading-relaxed">
                {book.lede || 'A story in this series.'}
              </p>

              {book.series_teaser && (
                <p className="font-serif italic text-sm text-[var(--color-ash)]">
                  ✦ &ldquo;{book.series_teaser}&rdquo;
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--color-ash)]">
                <span>{formatPublishedDate(book.created_at)}</span>
                {mins != null && (
                  <>
                    <span>·</span>
                    <span>~{mins} min read</span>
                  </>
                )}
                {critiques > 0 && (
                  <>
                    <span>·</span>
                    <span>{critiques} {critiques === 1 ? 'critique' : 'critiques'}</span>
                  </>
                )}
              </div>

              <div className="pt-2">
                <a
                  href={`/library/read/${book.id}/`}
                  className="inline-block font-mono text-xs uppercase tracking-wider px-4 py-2 border border-[var(--color-blood)] text-[var(--color-blood)] hover:bg-[var(--color-blood)] hover:text-[var(--color-bone)] transition-colors"
                >
                  START READING →
                </a>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}

export default withProviders(SeriesHub)
