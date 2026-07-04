import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { modCan } from '../../lib/moderation'
import { setContentModStatus } from '../../lib/modActions'

export default function InlineModControls({ targetType, targetId, currentStatus, authorId }) {
  const { profile } = useAuth()
  const [isBusy, setIsBusy] = useState(false)

  // Map targetType to area
  const area = ['story', 'critique'].includes(targetType) ? 'library' : 'forum'

  const canHide = modCan(profile, 'hide', area)
  const canScreen = modCan(profile, 'screen', area)

  if (!canHide && !canScreen) return null

  const handleAction = async (status) => {
    const reason = window.prompt(`Reason for changing status to ${status}? (Optional)`)
    if (reason === null) return // Cancelled

    setIsBusy(true)
    try {
      await setContentModStatus(targetType, targetId, status, reason || null)
      // Note: Ideally we'd trigger a re-fetch here, or rely on Realtime if the page is subscribed.
      // For now, an alert or relying on the user to refresh works, or just let React Query handle it if integrated.
      window.location.reload() 
    } catch (err) {
      alert(`Error: ${err.message}`)
      setIsBusy(false)
    }
  }

  const linkBtn = (color) => ({ background: 'none', border: 'none', color, cursor: 'pointer', padding: 0 })

  return (
    <div className="font-mono" style={{
      display: 'inline-flex', gap: '8px',
      border: '1px solid var(--color-accent-crimson)', padding: '2px 6px', borderRadius: '4px',
      marginLeft: '10px', fontSize: '11px'
    }}>
      <span style={{ color: 'var(--color-text-secondary)', marginRight: '4px' }}>[MOD]</span>

      {canHide && currentStatus !== 'hidden' && (
        <button
          onClick={() => handleAction('hidden')}
          disabled={isBusy}
          style={linkBtn('var(--color-accent-crimson)')}
        >
          Hide
        </button>
      )}

      {canHide && currentStatus === 'hidden' && (
        <button
          onClick={() => handleAction('live')}
          disabled={isBusy}
          style={linkBtn('var(--color-text-primary)')}
        >
          Unhide
        </button>
      )}

      {canScreen && currentStatus === 'live' && (
        <button
          onClick={() => handleAction('screening')}
          disabled={isBusy}
          style={linkBtn('var(--color-text-secondary)')}
        >
          Screen
        </button>
      )}
    </div>
  )
}
