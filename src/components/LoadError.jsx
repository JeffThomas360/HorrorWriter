import { useEffect } from 'react'

// What a visitor sees when a page's content fails to load. The raw error
// ("TypeError: Failed to fetch", a Postgres message) goes to the console for
// debugging, never on screen: it reads as a broken site and tells a reader
// nothing they can act on. The one action that usually works is trying again.
export default function LoadError({ title, message, onRetry, error }) {
  useEffect(() => {
    if (error) console.error(error)
  }, [error])
  return (
    <div role="alert" className="vintage-card text-center py-12 border-red-950 mt-8">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ember)] mb-4">{title}</p>
      <p className="font-serif italic text-sm text-[var(--color-text-secondary)] mb-6">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="border border-[var(--color-line)] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  )
}
