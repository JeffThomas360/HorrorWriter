import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AuthCallback() {
  const navigate = useNavigate()
  useEffect(() => {
    // Supabase handles the URL fragment automatically on import.
    // Once real auth is wired, exchange session here before navigating.
    navigate('/', { replace: true })
  }, [navigate])
  return (
    <section className="surface active" style={{ textAlign: 'center', paddingTop: 120 }}>
      <p className="eyebrow">Summoning…</p>
    </section>
  )
}
