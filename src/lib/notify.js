// Drop-in for sonner's `toast`. Everything passes straight through; only
// `toast.error` also reports the message the member was shown.
import { toast as sonner } from 'sonner'
import { reportSiteEvent } from './errorReporter'

function messageOf(content) {
  if (typeof content === 'string') return content.trim() ? content : null
  if (content instanceof Error) return content.message?.trim() ? content.message : null
  return null
}

function report(content) {
  try {
    const message = messageOf(content)
    if (!message) return
    Promise.resolve(reportSiteEvent({ kind: 'shown', message })).catch(() => {})
  } catch {
    // reporting must never affect the toast
  }
}

function error(...args) {
  const result = sonner.error(...args)
  report(args[0])
  return result
}

export const toast = new Proxy(sonner, {
  get(target, prop, receiver) {
    if (prop === 'error') return error
    return Reflect.get(target, prop, receiver)
  },
})
