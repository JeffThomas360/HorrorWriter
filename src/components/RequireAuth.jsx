import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * Wraps a route that requires the visitor to be signed in. If the auth
 * state is still loading, render a placeholder; if the visitor is not
 * signed in, pop the sign-in modal (via the Layout-supplied
 * `openSignin` outlet context) and show a friendly prompt rather than
 * yanking them away from the URL they meant to visit.
 */
export default function RequireAuth({ children }) {
  const { user, isLoading } = useAuth()
  const ctx = useOutletContext()

  useEffect(() => {
    if (!isLoading && !user) ctx?.openSignin?.()
  }, [isLoading, user, ctx])

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
            className="btn primary"
            onClick={() => ctx?.openSignin?.()}
          >
            Sign In
          </button>
        </div>
      </section>
    )
  }

  return children
}
