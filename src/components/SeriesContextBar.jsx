export default function SeriesContextBar({ seriesContext, onToggleSidebar, isMobile }) {
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
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-line)',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        color: 'var(--color-bone)',
        fontSize: '14px'
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={`/library/series/${series.id}`}
          style={{
            color: 'var(--color-bone)',
            textDecoration: 'none',
            cursor: 'pointer',
            marginRight: '1rem'
          }}
          onMouseEnter={(e) => (e.target.style.color = 'var(--color-blood)')}
          onMouseLeave={(e) => (e.target.style.color = 'var(--color-bone)')}
        >
          ◀ {series.title}
        </a>
        <span style={{ color: 'var(--color-ash)' }}>|</span>
        <span style={{ marginLeft: '1rem', marginRight: '1rem' }}>
          Part {partNumber} of {totalParts}: {currentBook.title}
        </span>
      </div>
      {isMobile && (
        <button
          onClick={onToggleSidebar}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-blood)',
            color: 'var(--color-blood)',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap'
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
          ⊕ expand series
        </button>
      )}
    </div>
  )
}
