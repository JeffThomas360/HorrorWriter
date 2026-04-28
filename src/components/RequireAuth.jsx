import { Navigate, useOutletContext } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function RequireAuth({ children }) {
  const { session, isLoading } = useAuth()
  const ctx = useOutletContext()

  if (isLoading) {
    return <section className="surface active" style={{textAlign:'center', paddingTop:120}}>Loading...</section>
  }

  if (!session) {
    // Ideally we'd open the modal here, but Navigate handles the redirect
    // We can just rely on the user clicking "Sign In"
    return <Navigate to="/" replace />
  }

  return children
}
