import { useEffect, useState } from 'react'
import { fetchSeriesWithBooks } from '../lib/series'
import { withProviders } from '../components/Providers'

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
    return <div style={{ color: 'var(--color-bone)', padding: '2rem' }}>Loading series...</div>
  }

  if (error) {
    return <div style={{ color: 'var(--color-blood)', padding: '2rem' }}>Error: {error}</div>
  }

  if (!series) {
    return <div style={{ color: 'var(--color-bone)', padding: '2rem' }}>Series not found</div>
  }

  return (
    <div style={{ color: 'var(--color-bone)' }}>
      {/* Header Section */}
      <section style={{ marginBottom: '3rem', paddingBottom: '3rem', borderBottom: '1px solid var(--color-line)' }}>
        <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '48px', margin: '0 0 0.5rem 0' }}>
          {series.title}
        </h1>
        {series.profiles?.handle && (
          <p style={{ color: 'var(--color-ash)', margin: '0 0 1rem 0' }}>
            A series by @{series.profiles.handle}
          </p>
        )}
        <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '1.5rem', maxWidth: '600px' }}>
          {series.description}
        </p>
        <p style={{ color: 'var(--color-ash)', fontSize: '14px' }}>
          {books.length} {books.length === 1 ? 'Story' : 'Stories'}
        </p>
      </section>

      {/* Reading Order Section */}
      <section>
        {books.map((book, idx) => (
          <div
            key={book.id}
            style={{
              marginBottom: '3rem',
              padding: '1.5rem',
              border: '1px solid var(--color-line)',
              background: 'var(--color-surface)'
            }}
          >
            <div style={{ color: 'var(--color-blood)', fontSize: '36px', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              ▶ {idx + 1}
            </div>
            <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '24px', margin: '0 0 0.5rem 0' }}>
              {book.title}
            </h2>
            <p style={{ fontSize: '16px', margin: '0 0 1rem 0', color: 'var(--color-bone)' }}>
              {/* Note: summary would come from books table; placeholder for now */}
              A story in this series.
            </p>
            <p style={{ fontSize: '14px', fontStyle: 'italic', color: 'var(--color-ash)', margin: '0 0 1rem 0' }}>
              ✦ "{book.series_teaser || 'Read to discover...'}"
            </p>
            <div style={{ fontSize: '12px', color: 'var(--color-ash)', marginBottom: '1rem' }}>
              Published
            </div>
            <a
              href={`/library/read/${book.id}`}
              style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                border: '1px solid var(--color-blood)',
                color: 'var(--color-blood)',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'var(--color-blood)'
                e.target.style.color = 'var(--color-bone)'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent'
                e.target.style.color = 'var(--color-blood)'
              }}
            >
              START READING →
            </a>
          </div>
        ))}
      </section>
    </div>
  )
}

export default withProviders(SeriesHub)
