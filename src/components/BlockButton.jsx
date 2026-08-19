import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { blockUser, unblockUser, isBlocked } from '../lib/blocking'

export default function BlockButton({ targetUserId, targetHandle }) {
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    isBlocked(targetUserId).then((v) => { if (!cancelled) setBlocked(v) }).catch(() => {})
    return () => { cancelled = true }
  }, [targetUserId])

  const handleClick = async () => {
    setBusy(true)
    try {
      if (blocked) {
        await unblockUser(targetUserId)
        setBlocked(false)
        toast.success(`Unblocked @${targetHandle}`)
      } else {
        await blockUser(targetUserId)
        setBlocked(true)
        toast.success(`Blocked @${targetHandle}. Their content is now hidden from you.`)
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="text-xs uppercase border border-[var(--color-line)] hover:border-[var(--color-blood)] px-2 py-0.5 text-[var(--color-ash)] hover:text-[var(--color-blood)] cursor-pointer disabled:opacity-50 transition-colors"
    >
      {blocked ? 'Unblock' : 'Block'}
    </button>
  )
}
