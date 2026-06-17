import { useEffect } from 'react'
import { useAuth } from './AuthContext'

/**
 * Wraps a route that requires the visitor to be signed in. If the auth
 * state is still loading, render a placeholder; if the visitor is not
 * signed in, pop the sign-in modal (via global window custom event)
 * and show a friendly prompt.
 */
export default function RequireAuth({ children }) {
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && !user) {
      window.dispatchEvent(new CustomEvent('open-signin'))
    }
  }, [isLoading, user])

  if (isLoading) {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow">▸ Loading…</p>
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow">▸ Sign in required</p>
          <p className="status-panel-body">
            You need to be signed in to view this page.
          </p>
          <button
            className="btn primary cursor-pointer"
            onClick={() => window.dispatchEvent(new CustomEvent('open-signin'))}
          >
            Sign In
          </button>
        </div>
      </section>
    )
  }

  return children
}
