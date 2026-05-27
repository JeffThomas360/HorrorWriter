import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useQuery } from '@tanstack/react-query'

export default function ReadStory() {
  const { id } = useParams()

  const { data: book, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['book', id],
    queryFn: async () => {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('books')
        .select('*, profiles(handle)')
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data
    }
  })

  useDocumentTitle(book ? book.title : 'Reading...')

  const error = queryError ? 'Story not found in the archives.' : null

  if (loading) return <section className="surface active"><p className="dim">Opening dusty pages...</p></section>
  if (error) return <section className="surface active"><p className="error">{error}</p><Link to="/library" className="btn ghost">Back to Library</Link></section>

  return (
    <div className="layout-content fade-in">
      <section className="surface active" style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '4rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <p className="eyebrow" style={{ color: `var(--${book?.cover || 'cyan'})` }}>
            ▸ A story by @{book?.profiles?.handle || 'unknown'}
          </p>
          <h1 className="title" style={{ fontSize: '3.5rem', marginBottom: '1.5rem', lineHeight: 1.1 }}>
            {book?.title}
          </h1>
          <p className="lede" style={{ fontStyle: 'italic', fontSize: '1.25rem', color: 'var(--bone-dim)', maxWidth: '600px', margin: '0 auto' }}>
            {book?.lede}
          </p>
        </div>

        <div style={{ 
          fontSize: '1.15rem', 
          lineHeight: '1.8', 
          color: 'var(--bone)', 
          fontFamily: 'var(--font-serif)',
          whiteSpace: 'pre-wrap',
          marginBottom: '4rem'
        }}>
          {book?.content || <span className="dim">This story has no text...</span>}
        </div>

        <div style={{ textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem' }}>
          <Link to="/library" className="btn ghost">&larr; Return to The Library</Link>
        </div>
      </section>
    </div>
  )
}
