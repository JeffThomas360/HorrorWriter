import { useEffect, useState } from 'react'
import { fetchSeriesWithBooks } from '../lib/series'
import withProviders from '../components/Providers'

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
    return <div style={{ color: '#E5E1D8', padding: '2rem' }}>Loading series...</div>
  }

  if (error) {
    return <div style={{ color: '#991B1B', padding: '2rem' }}>Error: {error}</div>
  }

  if (!series) {
    return <div style={{ color: '#E5E1D8', padding: '2rem' }}>Series not found</div>
  }

  return (
    <div style={{ color: '#E5E1D8' }}>
      {/* Header Section */}
      <section style={{ marginBottom: '3rem', paddingBottom: '3rem', borderBottom: '1px solid #2d2d2a' }}>
        <h1 style={{ fontFamily: 'Georgia', fontSize: '48px', margin: '0 0 0.5rem 0' }}>
          {series.title}
        </h1>
        <p style={{ color: '#A3A39C', margin: '0 0 1rem 0' }}>
          A series by [Author Name]
        </p>
        <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '1.5rem', maxWidth: '600px' }}>
          {series.description}
        </p>
        <p style={{ color: '#A3A39C', fontSize: '14px' }}>
          {books.length} Stories | Complete
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
              border: '1px solid #2d2d2a',
              background: '#1a1a1a'
            }}
          >
            <div style={{ color: '#991B1B', fontSize: '36px', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              ▶ {idx + 1}
            </div>
            <h2 style={{ fontFamily: 'Georgia', fontSize: '24px', margin: '0 0 0.5rem 0' }}>
              {book.title}
            </h2>
            <p style={{ fontSize: '16px', margin: '0 0 1rem 0', color: '#E5E1D8' }}>
              {/* Note: summary would come from books table; placeholder for now */}
              A story in this series.
            </p>
            <p style={{ fontSize: '14px', fontStyle: 'italic', color: '#A3A39C', margin: '0 0 1rem 0' }}>
              ✦ "{book.series_teaser || 'Read to discover...'}"
            </p>
            <div style={{ fontSize: '12px', color: '#A3A39C', marginBottom: '1rem' }}>
              Published
            </div>
            <a
              href={`/library/read/${book.id}`}
              style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                border: '1px solid #991B1B',
                color: '#991B1B',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#991B1B'
                e.target.style.color = '#E5E1D8'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent'
                e.target.style.color = '#991B1B'
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
