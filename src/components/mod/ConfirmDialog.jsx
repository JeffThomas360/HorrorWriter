import { useEffect, useRef, useState } from 'react'

/**
 * Shared confirmation / reason-capture modal for the moderation Terminal.
 * Replaces window.prompt()/window.confirm() everywhere in this directory —
 * those block the render thread, can't be styled, and don't match the VHS
 * chrome. This is the one dialog every destructive mod action should route
 * through.
 *
 * Usage:
 *   <ConfirmDialog
 *     open={open}
 *     title="Permanently shadowban @user?"
 *     description="This hides all future content and cannot be undone from here."
 *     danger
 *     requireReason
 *     confirmLabel="Shadowban"
 *     busy={busy}
 *     onCancel={() => setOpen(false)}
 *     onConfirm={(reason) => doThing(reason)}
 *   />
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  requireReason = false,
  withReason = false,
  reasonLabel = 'Reason (published where relevant)',
  reasonPlaceholder = 'Explain the decision…',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const showReasonField = withReason || requireReason
  const [reason, setReason] = useState('')
  const dialogRef = useRef(null)

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.()
    }
    document.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const canConfirm = !busy && (!requireReason || reason.trim().length > 0)

  const confirmBtn = danger
    ? 'btn-vhs disabled:opacity-40 disabled:cursor-not-allowed'
    : 'border border-[var(--color-upside)] text-[var(--color-upside)] hover:bg-[var(--color-upside)] hover:text-[var(--color-void)] font-mono text-xs uppercase tracking-wider px-4 py-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--color-upside)]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.() }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mod-confirm-title"
        tabIndex={-1}
        className="card-raised w-full max-w-md p-5 outline-none"
      >
        <h3 id="mod-confirm-title" className="font-['Fraunces'] font-bold text-base text-[var(--color-bone)] mb-2">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-[var(--color-ash)] mb-4">{description}</p>
        )}
        {showReasonField && (
          <div className="mb-4">
            <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-ash)] mb-1">
              {reasonLabel}
            </label>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              className="w-full bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none font-mono"
            />
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border border-[var(--color-line-hi)] px-4 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-bone)] transition-colors hover:border-[var(--color-bone)] cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm?.(showReasonField ? reason.trim() : undefined)}
            disabled={!canConfirm}
            className={confirmBtn}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
