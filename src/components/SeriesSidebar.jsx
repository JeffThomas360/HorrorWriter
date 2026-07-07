import { useEffect } from 'react'

export default function SeriesSidebar({ seriesContext, isOpen, onClose, isMobile }) {
  if (!seriesContext) return null

  const { series, allBooks, currentIndex } = seriesContext

  useEffect(() => {
    // Close sidebar on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEscape)
    }
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Desktop: right sidebar
  if (!isMobile) {
    return (
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '280px',
          height: '100vh',
          background: '#1a1a1a',
          borderLeft: '1px solid #2d2d2a',
          padding: '1.5rem',
          overflowY: 'auto',
          color: '#E5E1D8',
          fontFamily: 'Georgia, serif',
          fontSize: '14px',
          zIndex: 998
        }}
      >
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '16px', fontWeight: 'bold' }}>
          {series.title}
        </h3>
        <p style={{ margin: '0 0 1.5rem 0', color: '#A3A39C', fontSize: '12px' }}>
          by [Author Name]
        </p>
        <hr style={{ border: 'none', borderTop: '1px solid #2d2d2a', margin: '0 0 1rem 0' }} />

        {/* Parts List */}
        <ul style={{ listStyle: 'none', padding: '0', margin: '0 0 1.5rem 0' }}>
          {allBooks.map((book, idx) => {
            const isCurrentPart = idx === currentIndex
            const isBeforeCurrent = idx < currentIndex
            const opacityStyle = isBeforeCurrent ? 0.5 : 1

            return (
              <li
                key={book.id}
                style={{
                  marginBottom: '1rem',
                  opacity: opacityStyle,
                  borderLeft: isBeforeCurrent ? '2px solid #991B1B' : 'none',
                  paddingLeft: isBeforeCurrent ? '0.5rem' : '0',
                  background: isCurrentPart ? '#2d2d2a' : 'transparent',
                  padding: '0.5rem'
                }}
              >
                <a
                  href={`/library/read/${book.id}`}
                  style={{
                    color: isCurrentPart ? '#991B1B' : '#E5E1D8',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    fontWeight: isCurrentPart ? 'bold' : 'normal',
                    fontSize: isCurrentPart ? '15px' : '14px'
                  }}
                >
                  {isCurrentPart ? '●' : isBeforeCurrent ? '✓' : '□'} {idx + 1}. {book.title}
                </a>
                <div style={{ fontSize: '12px', color: '#A3A39C', marginTop: '0.25rem' }}>
                  {isCurrentPart && '(You are here)'}
                  {isBeforeCurrent && '(Completed)'}
                  {!isCurrentPart && !isBeforeCurrent && '(Not yet read)'}
                </div>
              </li>
            )
          })}
        </ul>

        {/* Navigation Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {currentIndex > 0 && (
            <a
              href={`/library/read/${allBooks[currentIndex - 1].id}`}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #991B1B',
                color: '#991B1B',
                textDecoration: 'none',
                textAlign: 'center',
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
              ← Prev
            </a>
          )}
          {currentIndex < allBooks.length - 1 && (
            <a
              href={`/library/read/${allBooks[currentIndex + 1].id}`}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #991B1B',
                color: '#991B1B',
                textDecoration: 'none',
                textAlign: 'center',
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
              Next →
            </a>
          )}
        </div>
      </aside>
    )
  }

  // Mobile: modal/drawer
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 997
          }}
        />
      )}

      {/* Modal */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: '80vh',
            background: '#1a1a1a',
            borderTop: '1px solid #2d2d2a',
            padding: '1.5rem',
            overflowY: 'auto',
            color: '#E5E1D8',
            fontFamily: 'Georgia, serif',
            fontSize: '14px',
            zIndex: 998
          }}
        >
          {/* Close Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
              {series.title}
            </h3>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#E5E1D8',
                fontSize: '24px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>

          {/* Parts List (same as desktop) */}
          <ul style={{ listStyle: 'none', padding: '0', margin: '0 0 1.5rem 0' }}>
            {allBooks.map((book, idx) => {
              const isCurrentPart = idx === currentIndex
              const isBeforeCurrent = idx < currentIndex
              const opacityStyle = isBeforeCurrent ? 0.5 : 1

              return (
                <li
                  key={book.id}
                  style={{
                    marginBottom: '1rem',
                    opacity: opacityStyle,
                    borderLeft: isBeforeCurrent ? '2px solid #991B1B' : 'none',
                    paddingLeft: isBeforeCurrent ? '0.5rem' : '0',
                    background: isCurrentPart ? '#2d2d2a' : 'transparent',
                    padding: '0.5rem'
                  }}
                >
                  <a
                    href={`/library/read/${book.id}`}
                    onClick={onClose}
                    style={{
                      color: isCurrentPart ? '#991B1B' : '#E5E1D8',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      fontWeight: isCurrentPart ? 'bold' : 'normal',
                      fontSize: isCurrentPart ? '15px' : '14px'
                    }}
                  >
                    {isCurrentPart ? '●' : isBeforeCurrent ? '✓' : '□'} {idx + 1}. {book.title}
                  </a>
                  <div style={{ fontSize: '12px', color: '#A3A39C', marginTop: '0.25rem' }}>
                    {isCurrentPart && '(You are here)'}
                    {isBeforeCurrent && '(Completed)'}
                    {!isCurrentPart && !isBeforeCurrent && '(Not yet read)'}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentIndex > 0 && (
              <a
                href={`/library/read/${allBooks[currentIndex - 1].id}`}
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: '1px solid #991B1B',
                  color: '#991B1B',
                  textDecoration: 'none',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ← Prev
              </a>
            )}
            {currentIndex < allBooks.length - 1 && (
              <a
                href={`/library/read/${allBooks[currentIndex + 1].id}`}
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: '1px solid #991B1B',
                  color: '#991B1B',
                  textDecoration: 'none',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </>
  )
}
