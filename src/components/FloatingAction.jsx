import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { IconPlus, IconEdit } from './Icons'

export default function FloatingAction({ onSignInClick }) {
  const { session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Only show on specific routes
  const isForum = location.pathname === '/forum' || location.pathname.startsWith('/thread/')
  const isLibrary = location.pathname === '/library' || location.pathname.startsWith('/story/')

  if (!isForum && !isLibrary) return null

  const handleClick = () => {
    if (!session) {
      onSignInClick()
      return
    }
    if (isForum) navigate('/forum/new')
    if (isLibrary) navigate('/publish')
  }

  return (
    <button className="fab" onClick={handleClick} aria-label={isForum ? "Summon Thread" : "Publish Story"}>
      {isLibrary ? <IconEdit /> : <IconPlus />}
    </button>
  )
}
