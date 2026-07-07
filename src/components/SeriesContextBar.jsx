export default function SeriesContextBar({ seriesContext, onToggleSidebar }) {
  if (!seriesContext) return null

  const { series, allBooks, currentIndex } = seriesContext
  const currentBook = allBooks[currentIndex]
  const totalParts = allBooks.length
  const partNumber = currentIndex + 1

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        background: '#1a1a1a',
        borderBottom: '1px solid #2d2d2a',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        color: '#E5E1D8',
        fontSize: '14px'
      }}
    >
      <div style={{ flex: 1 }}>
        <a
          href={`/library/series/${series.id}`}
          style={{
            color: '#E5E1D8',
            textDecoration: 'none',
            cursor: 'pointer',
            marginRight: '1rem'
          }}
          onMouseEnter={(e) => (e.target.style.color = '#991B1B')}
          onMouseLeave={(e) => (e.target.style.color = '#E5E1D8')}
        >
          ◀ {series.title}
        </a>
        <span style={{ color: '#A3A39C' }}>|</span>
        <span style={{ marginLeft: '1rem', marginRight: '1rem' }}>
          Part {partNumber} of {totalParts}: {currentBook.title}
        </span>
      </div>
      <button
        onClick={onToggleSidebar}
        style={{
          background: 'transparent',
          border: '1px solid #991B1B',
          color: '#991B1B',
          padding: '0.5rem 1rem',
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
        ⊕ expand series
      </button>
    </div>
  )
}
