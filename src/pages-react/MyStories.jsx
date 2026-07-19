import { useState } from 'react'
import { useAuth } from '../components/AuthContext'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'
import {
  fetchMySeriesWithBooks,
  fetchMyBooks,
  createSeriesWithInitialStory,
  addBookToSeries,
  removeBookFromSeries,
  updateBookSortOrder,
  deleteSeries,
} from '../lib/series'

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

function MyStories() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [newSeriesOpen, setNewSeriesOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newInitialBookId, setNewInitialBookId] = useState('')

  const seriesQuery = useQuery({
    queryKey: ['my-series', user?.id],
    queryFn: () => fetchMySeriesWithBooks(user.id),
    enabled: !!user,
  })

  const booksQuery = useQuery({
    queryKey: ['my-books', user?.id],
    queryFn: () => fetchMyBooks(user.id),
    enabled: !!user,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['my-series', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['my-books', user?.id] })
  }

  const createMutation = useMutation({
    mutationFn: createSeriesWithInitialStory,
    onSuccess: () => {
      toast.success('Series created')
      setNewSeriesOpen(false)
      setNewTitle('')
      setNewDescription('')
      setNewInitialBookId('')
      invalidateAll()
    },
    onError: (err) => toast.error(err.message || 'Failed to create series'),
  })

  const addMutation = useMutation({
    mutationFn: addBookToSeries,
    onSuccess: () => { toast.success('Added to series'); invalidateAll() },
    onError: (err) => toast.error(err.message || 'Failed to add to series'),
  })

  const removeMutation = useMutation({
    mutationFn: removeBookFromSeries,
    onSuccess: () => { toast.success('Removed from series'); invalidateAll() },
    onError: (err) => toast.error(err.message || 'Failed to remove from series'),
  })

  const reorderMutation = useMutation({
    mutationFn: updateBookSortOrder,
    onSuccess: () => invalidateAll(),
    onError: (err) => toast.error(err.message || 'Failed to update order'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSeries,
    onSuccess: () => { toast.success('Series deleted'); invalidateAll() },
    onError: (err) => toast.error(err.message || 'Failed to delete series'),
  })

  const loading = seriesQuery.isLoading || booksQuery.isLoading
  const series = seriesQuery.data || []
  const books = booksQuery.data || []
  const unassignedBooks = books.filter(b => !b.seriesId)

  const handleCreateSeries = (e) => {
    e.preventDefault()
    if (!newTitle.trim() || !newInitialBookId) return
    createMutation.mutate({
      authorId: user.id,
      title: newTitle,
      description: newDescription,
      initialBookId: newInitialBookId,
    })
  }

  const handleDeleteSeries = (s) => {
    if (!window.confirm(`Delete "${s.title}"? This can't be undone. Your stories won't be deleted — they'll just no longer be part of a series.`)) return
    deleteMutation.mutate(s.id)
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] mt-8">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Loading your stories…</p>
    </div>
  )

  return (
    <div className="mt-8 max-w-3xl mx-auto">
      <div className="border-b border-[#2d2d2a] pb-6 mb-12">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">The Library</span>
        <h2 className="text-3xl font-serif font-black">My <em className="italic text-[var(--color-accent-crimson)] font-serif">stories</em></h2>
        <p className="text-xs text-[var(--color-text-secondary)] font-serif mt-1">Manage your published stories and the series they belong to.</p>
      </div>

      {/* ── Your Series ── */}
      <section className="mb-16">
        <h3 className="font-serif font-bold text-xl text-[var(--color-text-primary)] mb-6">Your Series</h3>

        {!newSeriesOpen ? (
          <button
            type="button"
            className="border border-[#2d2d2a] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors mb-8 cursor-pointer"
            onClick={() => setNewSeriesOpen(true)}
          >
            + New Series
          </button>
        ) : (
          <form onSubmit={handleCreateSeries} className="vintage-card flex flex-col gap-4 mb-8">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Title</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                placeholder="The Hollow Chronicles"
                className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Description (optional)</label>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="A three-part descent into the house that remembers."
                className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Starting story</label>
              <select
                value={newInitialBookId}
                onChange={(e) => setNewInitialBookId(e.target.value)}
                required
                className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
              >
                <option value="">Choose a story…</option>
                {unassignedBooks.map(b => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>
              {unassignedBooks.length === 0 && (
                <span className="text-xs font-serif italic text-[var(--color-text-secondary)]">
                  All of your stories are already in a series.
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={createMutation.isPending || unassignedBooks.length === 0}
                className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-5 py-2.5 hover:bg-red-700 transition-colors cursor-pointer"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Series'}
              </button>
              <button
                type="button"
                className="border border-[#2d2d2a] hover:border-white font-mono text-xs uppercase px-4 py-2.5 transition-colors cursor-pointer"
                onClick={() => setNewSeriesOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {series.length === 0 ? (
          <p className="font-serif italic text-xs text-[var(--color-text-secondary)]">
            No series yet — create one above to start grouping your stories.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {series.map(s => (
              <div key={s.id} className="vintage-card flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-serif font-bold text-lg text-[var(--color-text-primary)]">{s.title}</h4>
                    {s.description && <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mt-1">{s.description}</p>}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 border border-[#2d2d2a] hover:border-[var(--color-accent-crimson)] hover:text-[var(--color-accent-crimson)] font-mono text-xs uppercase px-3 py-1.5 transition-colors cursor-pointer"
                    onClick={() => handleDeleteSeries(s)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete Series
                  </button>
                </div>

                {s.books.length === 0 ? (
                  <p className="font-serif italic text-xs text-[var(--color-text-secondary)]">No stories in this series yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2 border-t border-[#2d2d2a] pt-4">
                    {s.books.map(b => (
                      <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-[var(--color-text-primary)] font-serif">{b.title}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <label className="flex items-center gap-2 font-mono text-xs text-[var(--color-text-secondary)] uppercase">
                            Position
                            <input
                              type="number"
                              defaultValue={b.sort_order}
                              min={0}
                              className="w-14 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-2 py-1 text-xs focus:border-[var(--color-accent-crimson)] focus:outline-none"
                              onBlur={(e) => {
                                const value = Number(e.target.value)
                                if (!Number.isNaN(value) && value !== b.sort_order) {
                                  reorderMutation.mutate({ seriesId: s.id, bookId: b.id, sortOrder: value })
                                }
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className="font-mono text-xs uppercase text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
                            onClick={() => removeMutation.mutate({ seriesId: s.id, bookId: b.id })}
                            disabled={removeMutation.isPending}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Your Stories ── */}
      <section>
        <h3 className="font-serif font-bold text-xl text-[var(--color-text-primary)] mb-6">Your Stories</h3>

        {books.length === 0 ? (
          <p className="font-serif italic text-xs text-[var(--color-text-secondary)]">
            You haven't published any stories yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {books.map(b => (
              <li key={b.id} className="vintage-card flex items-center justify-between gap-4">
                <div>
                  <p className="font-serif font-bold text-[var(--color-text-primary)]">{b.title}</p>
                  <p className="font-mono text-xs text-[var(--color-text-secondary)] mt-1">
                    {postedAgo(b.created_at)} · {b.comments_count || 0} {b.comments_count === 1 ? 'critique' : 'critiques'}
                  </p>
                </div>

                {b.seriesId ? (
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs text-[var(--color-text-secondary)] uppercase">In: {b.seriesTitle}</span>
                    <button
                      type="button"
                      className="font-mono text-xs uppercase text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
                      onClick={() => removeMutation.mutate({ seriesId: b.seriesId, bookId: b.id })}
                      disabled={removeMutation.isPending}
                    >
                      Remove from series
                    </button>
                  </div>
                ) : series.length > 0 ? (
                  <AddToSeriesControl
                    book={b}
                    seriesOptions={series}
                    onAdd={(seriesId) => addMutation.mutate({ seriesId, bookId: b.id })}
                    isPending={addMutation.isPending}
                  />
                ) : (
                  <span className="shrink-0 font-mono text-xs text-[var(--color-text-secondary)] uppercase">Not in a series</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AddToSeriesControl({ seriesOptions, onAdd, isPending }) {
  const [selected, setSelected] = useState('')
  return (
    <div className="flex items-center gap-2 shrink-0">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-2 py-1.5 text-xs font-mono focus:border-[var(--color-accent-crimson)] focus:outline-none"
      >
        <option value="">Add to series…</option>
        {seriesOptions.map(s => (
          <option key={s.id} value={s.id}>{s.title}</option>
        ))}
      </select>
      <button
        type="button"
        className="font-mono text-xs uppercase border border-[#2d2d2a] hover:border-white px-2 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
        disabled={!selected || isPending}
        onClick={() => { onAdd(selected); setSelected('') }}
      >
        Add
      </button>
    </div>
  )
}

function MyStoriesWithAuth(props) {
  return (
    <RequireAuth>
      <MyStories {...props} />
    </RequireAuth>
  )
}

export default withProviders(MyStoriesWithAuth)
