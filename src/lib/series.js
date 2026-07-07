import { supabase } from '../supabaseClient'

/**
 * Fetch a series with all its books ordered by sort_order.
 * Returns { series, books } or null if not found.
 */
export async function fetchSeriesWithBooks(seriesId) {
  // Fetch series
  const { data: seriesData, error: seriesError } = await supabase
    .from('series')
    .select('id, author_id, title, description, created_at')
    .eq('id', seriesId)
    .single()

  if (seriesError || !seriesData) {
    return null
  }

  // Fetch books in this series, ordered by sort_order
  const { data: booksData, error: booksError } = await supabase
    .from('series_books')
    .select(`
      sort_order,
      books:book_id (
        id,
        title,
        series_teaser,
        created_at,
        author_id
      )
    `)
    .eq('series_id', seriesId)
    .order('sort_order', { ascending: true })

  if (booksError) {
    console.error('Error fetching series books:', booksError)
    return null
  }

  // Flatten: combine sort_order with book data
  const books = (booksData || []).map(row => ({
    ...row.books,
    sort_order: row.sort_order
  }))

  return { series: seriesData, books }
}

/**
 * Fetch a story's series context (if it's part of a series).
 * Returns { series, allBooks, currentIndex } or null.
 */
export async function fetchStorySeriesContext(bookId) {
  // Find which series this book belongs to
  const { data: seriesBooksData, error } = await supabase
    .from('series_books')
    .select('series_id')
    .eq('book_id', bookId)
    .single()

  if (error || !seriesBooksData) {
    return null
  }

  // Fetch the full series with all books
  const context = await fetchSeriesWithBooks(seriesBooksData.series_id)
  if (!context) {
    return null
  }

  // Find current book's index
  const currentIndex = context.books.findIndex(b => b.id === bookId)
  if (currentIndex === -1) {
    return null
  }

  return {
    series: context.series,
    allBooks: context.books,
    currentIndex
  }
}
