const DRAFT_PREFIX = 'hw_draft_'

export function saveDraft(key, data) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const payload = JSON.stringify({
      ...data,
      savedAt: new Date().toISOString()
    })
    window.localStorage.setItem(`${DRAFT_PREFIX}${key}`, payload)
  } catch (err) {
    console.error('Failed to save draft:', err)
  }
}

export function getDraft(key) {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${key}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (err) {
    console.error('Failed to load draft:', err)
    return null
  }
}

export function clearDraft(key) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(`${DRAFT_PREFIX}${key}`)
  } catch (err) {
    console.error('Failed to clear draft:', err)
  }
}
