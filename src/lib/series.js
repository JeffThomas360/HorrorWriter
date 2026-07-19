import { supabase } from '../supabaseClient'

/**
 * Fetch a series with all its books ordered by sort_order.
 * Returns { series, books } or null if not found.
 */
export async function fetchSeriesWithBooks(seriesId) {
  if (!supabase) return null

  // Fetch series
  const { data: seriesData, error: seriesError } = await supabase
    .from('series')
    .select('id, author_id, title, description, created_at, profiles(handle)')
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
  if (!supabase) return null

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

/**
 * Fetch all of an author's series, each with its books ordered by sort_order.
 */
export async function fetchMySeriesWithBooks(authorId) {
  if (!supabase || !authorId) return []

  const { data: seriesRows, error: seriesError } = await supabase
    .from('series')
    .select('id, title, description, created_at')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })

  if (seriesError || !seriesRows || seriesRows.length === 0) return []

  const seriesIds = seriesRows.map(s => s.id)

  const { data: booksRows, error: booksError } = await supabase
    .from('series_books')
    .select('series_id, sort_order, books:book_id (id, title, created_at)')
    .in('series_id', seriesIds)
    .order('sort_order', { ascending: true })

  if (booksError) {
    console.error('Error fetching my series books:', booksError)
  }

  const booksBySeriesId = {}
  for (const row of booksRows || []) {
    if (!booksBySeriesId[row.series_id]) booksBySeriesId[row.series_id] = []
    booksBySeriesId[row.series_id].push({ ...row.books, sort_order: row.sort_order })
  }

  return seriesRows.map(s => ({
    ...s,
    books: booksBySeriesId[s.id] || []
  }))
}

/**
 * Fetch all of an author's published books, each marked with its current
 * series assignment (if any). One series per book, so seriesId is singular.
 */
export async function fetchMyBooks(authorId) {
  if (!supabase || !authorId) return []

  const { data: books, error: booksError } = await supabase
    .from('books')
    .select('id, title, lede, created_at, comments_count')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })

  if (booksError || !books || books.length === 0) return []

  const bookIds = books.map(b => b.id)

  const { data: seriesBooks, error: seriesBooksError } = await supabase
    .from('series_books')
    .select('book_id, series:series_id (id, title)')
    .in('book_id', bookIds)

  if (seriesBooksError) {
    console.error('Error fetching series assignment for my books:', seriesBooksError)
  }

  const seriesByBookId = {}
  for (const row of seriesBooks || []) {
    seriesByBookId[row.book_id] = row.series
  }

  return books.map(b => ({
    ...b,
    seriesId: seriesByBookId[b.id]?.id || null,
    seriesTitle: seriesByBookId[b.id]?.title || null
  }))
}

/**
 * Lightweight id/title list of an author's series, for the PublishStory
 * attach-only dropdown (and reusable anywhere a plain series picker is needed).
 */
export async function fetchAuthorSeriesOptions(authorId) {
  if (!supabase || !authorId) return []

  const { data, error } = await supabase
    .from('series')
    .select('id, title')
    .eq('author_id', authorId)
    .order('title', { ascending: true })

  if (error || !data) return []
  return data
}

/**
 * Create a new series and link its one required initial story in a single
 * flow. A series is never created empty.
 */
export async function createSeriesWithInitialStory({ authorId, title, description, initialBookId }) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: series, error: seriesError } = await supabase
    .from('series')
    .insert({ author_id: authorId, title: title.trim(), description: description?.trim() || null })
    .select('id')
    .single()

  if (seriesError) throw seriesError

  const { error: linkError } = await supabase
    .from('series_books')
    .insert({ series_id: series.id, book_id: initialBookId, sort_order: 0 })

  if (linkError) throw linkError

  return series
}

/**
 * Add a story to an existing series, appended after the current last story.
 */
export async function addBookToSeries({ seriesId, bookId }) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: existing, error: fetchError } = await supabase
    .from('series_books')
    .select('sort_order')
    .eq('series_id', seriesId)
    .order('sort_order', { ascending: false })
    .limit(1)

  if (fetchError) throw fetchError

  const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

  const { error } = await supabase
    .from('series_books')
    .insert({ series_id: seriesId, book_id: bookId, sort_order: nextSortOrder })

  if (error) throw error
}

/**
 * Unassign a story from a series. The story itself is untouched.
 */
export async function removeBookFromSeries({ seriesId, bookId }) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('series_books')
    .delete()
    .eq('series_id', seriesId)
    .eq('book_id', bookId)

  if (error) throw error
}

/**
 * Update a story's position within its series.
 */
export async function updateBookSortOrder({ seriesId, bookId, sortOrder }) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('series_books')
    .update({ sort_order: sortOrder })
    .eq('series_id', seriesId)
    .eq('book_id', bookId)

  if (error) throw error
}

/**
 * Permanently delete a series. series_books rows for it cascade-delete via
 * the existing FK; the stories themselves are untouched. Real delete, no
 * soft-delete/restore — see the 2026-07-19 deletion-policy correction.
 */
export async function deleteSeries(seriesId) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('series')
    .delete()
    .eq('id', seriesId)

  if (error) throw error
}
