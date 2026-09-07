import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../AuthContext'
import { modCan } from '../../lib/moderation'
import { setContentModStatus } from '../../lib/modActions'
import ConfirmDialog from './ConfirmDialog'

export default function InlineModControls({ targetType, targetId, currentStatus, authorId }) {
  const { profile } = useAuth()
  const [isBusy, setIsBusy] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(null) // 'hidden' | 'live' | 'screening'

  // Map targetType to area
  const area = ['story', 'critique'].includes(targetType) ? 'library' : 'forum'

  const canHide = modCan(profile, 'hide', area)
  const canScreen = modCan(profile, 'screen', area)

  if (!canHide && !canScreen) return null

  const confirmAction = async (reason) => {
    setIsBusy(true)
    try {
      await setContentModStatus(targetType, targetId, pendingStatus, reason || null)
      setPendingStatus(null)
      window.location.reload()
    } catch (err) {
      toast.error(err.message)
      setIsBusy(false)
      setPendingStatus(null)
    }
  }

  const STATUS_COPY = {
    hidden: { title: 'Hide this content?', confirmLabel: 'Hide', danger: true },
    live: { title: 'Unhide this content?', confirmLabel: 'Unhide', danger: false },
    screening: { title: 'Send this content to screening?', confirmLabel: 'Screen', danger: false },
  }
  const dialogCopy = pendingStatus ? STATUS_COPY[pendingStatus] : null

  const linkBtn = 'bg-transparent border-0 cursor-pointer p-0 disabled:opacity-50'

  return (
    <div className="inline-flex items-center gap-2 border border-[var(--color-blood)] px-2 py-0.5 rounded ml-2 font-mono text-[11px]">
      {dialogCopy && (
        <ConfirmDialog
          open={!!pendingStatus}
          title={dialogCopy.title}
          danger={dialogCopy.danger}
          withReason
          reasonLabel="Reason (optional)"
          confirmLabel={dialogCopy.confirmLabel}
          busy={isBusy}
          onCancel={() => setPendingStatus(null)}
          onConfirm={confirmAction}
        />
      )}
      <span className="text-[var(--color-ash)] mr-1">[MOD]</span>

      {canHide && currentStatus !== 'hidden' && (
        <button onClick={() => setPendingStatus('hidden')} disabled={isBusy} className={`${linkBtn} text-[var(--color-ember)]`}>
          Hide
        </button>
      )}

      {canHide && currentStatus === 'hidden' && (
        <button onClick={() => setPendingStatus('live')} disabled={isBusy} className={`${linkBtn} text-[var(--color-bone)]`}>
          Unhide
        </button>
      )}

      {canScreen && currentStatus === 'live' && (
        <button onClick={() => setPendingStatus('screening')} disabled={isBusy} className={`${linkBtn} text-[var(--color-ash)]`}>
          Screen
        </button>
      )}
    </div>
  )
}
