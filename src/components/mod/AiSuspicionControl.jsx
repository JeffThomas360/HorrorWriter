import { useEffect, useState } from 'react'
import { toast } from '../../lib/notify'
import {
  fetchTaggedIds, fetchEvidence, setSuspected, evidenceLine, EVIDENCE_CAVEAT,
} from '../../lib/aiSuspicion'
import ConfirmDialog from './ConfirmDialog'

/**
 * The "Suspected AI" tick in the [MOD] strip. A mark for staff only: tagging
 * changes nothing about the submission and tells nobody. Rendered only for
 * staff who can screen the area (InlineModControls decides).
 */
export default function AiSuspicionControl({ targetType, targetId }) {
  const [tagged, setTagged] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // undefined = loading, null = could not be read
  const [evidence, setEvidence] = useState(undefined)

  useEffect(() => {
    let live = true
    fetchTaggedIds().then((ids) => { if (live) setTagged(ids.has(targetId)) })
    return () => { live = false }
  }, [targetId])

  useEffect(() => {
    if (!open) return
    let live = true
    setEvidence(undefined)
    fetchEvidence(targetType, targetId)
      .then((data) => {
        if (!live) return
        setEvidence(data ?? null)
        // The shared tag list can be stale or have failed to load. The evidence is
        // fresh: if it says tagged, never offer to tag over another moderator's note.
        if (data) setTagged(Boolean(data.tag))
      })
      .catch(() => { if (live) setEvidence(null) })
    return () => { live = false }
  }, [open, targetType, targetId])

  const confirm = async (reason) => {
    setBusy(true)
    try {
      await setSuspected(targetType, targetId, !tagged, reason || null)
      setTagged(!tagged)
      setOpen(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const tag = evidence?.tag
  const description = (
    <>
      {tagged && tag && (
        <span className="block mb-2 text-[var(--color-bone)]">
          Tagged by @{tag.tagged_by_handle || 'a former moderator'}: {tag.note || 'no note left'}
        </span>
      )}
      <span className="block font-mono text-xs text-[var(--color-bone)]">
        {evidence === undefined
          ? 'Loading the evidence…'
          : evidence === null ? 'The evidence could not be loaded.' : evidenceLine(evidence)}
      </span>
      <span className="block mt-2 text-xs">{EVIDENCE_CAVEAT}</span>
      <span className="block mt-2 text-xs">
        Only staff see this tag. It does not hide the submission or tell the writer.
      </span>
    </>
  )

  return (
    <>
      <ConfirmDialog
        open={open}
        title={tagged ? 'Remove the suspected-AI tag?' : 'Tag as suspected AI?'}
        description={description}
        withReason
        reasonLabel={tagged ? 'Why remove it? (optional)' : 'What makes you think so?'}
        reasonPlaceholder={tagged ? 'What changed your mind…' : 'What you noticed…'}
        confirmLabel={tagged ? 'Remove tag' : 'Tag it'}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
      />
      <button
        type="button"
        aria-pressed={tagged}
        onClick={() => setOpen(true)}
        disabled={busy}
        className={`bg-transparent border-0 cursor-pointer p-0 disabled:opacity-50 ${tagged ? 'text-[var(--color-ember)]' : 'text-[var(--color-ash)]'}`}
      >
        <span aria-hidden="true">{tagged ? '☑ ' : '☐ '}</span>Suspected AI
      </button>
    </>
  )
}
