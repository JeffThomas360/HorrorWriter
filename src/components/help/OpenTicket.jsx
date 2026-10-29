import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../AuthContext'
import { withProviders } from '../Providers'
import Turnstile from '../Turnstile'
import { TURNSTILE_FAILED } from '../../lib/turnstile'
import { TOPICS, openTicket, ticketErrorMessage } from '../../lib/tickets'

/**
 * The Help page's front door to a ticket: topic -> that topic's FAQ -> form.
 *
 * The server render is a plain link to this section, visible before any JavaScript
 * runs (never a primary CTA hidden until JS). Once auth has resolved, signed-out
 * visitors get a sign-in button and members start the flow. The length checks and
 * every other guard live in the database; the checks here only spare a Turnstile
 * token (good for one send) from being spent on a message the server would refuse.
 *
 * `faq` is trusted build-time HTML (Jeff's markdown, rendered by Astro). Member text
 * is only ever a form value or text content, never markup.
 */

const SUBJECT = { min: 5, max: 120 }
const BODY = { min: 20, max: 2000 }

const FIELD =
  'bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-base text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none w-full'
const LABEL = 'font-mono text-xs uppercase tracking-widest text-[var(--color-ash)]'
const COUNT = 'self-end font-mono text-xs text-[var(--color-ash)]'
const PRIMARY = 'btn-vhs items-center min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed'
const SECONDARY =
  'inline-flex items-center font-mono text-xs uppercase tracking-widest px-4 min-h-[44px] border border-[var(--color-line-hi)] text-[var(--color-bone)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)] cursor-pointer'
const TOPIC_BUTTON =
  'font-mono text-sm uppercase tracking-wide px-4 py-3 min-h-[44px] border border-[var(--color-line-hi)] text-[var(--color-bone)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)] cursor-pointer'
const HEADING = 'font-serif font-bold text-xl text-[var(--color-bone)] outline-none'

function OpenTicket({ faq = [] }) {
  const { session, user, isLoading } = useAuth()
  // idle -> topic -> (answers ->) form -> sent
  const [step, setStep] = useState('idle')
  const [topic, setTopic] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [token, setToken] = useState(null)
  const [resetKey, setResetKey] = useState(0)
  // The widget itself is broken (script blocked, errored, timed out). The server
  // always requires a token, so Send stays disabled; the member is told why.
  const [widgetFailed, setWidgetFailed] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const focusRef = useRef(null)

  // Keyboard and screen-reader users land on the new step's heading.
  useEffect(() => {
    if (step !== 'idle') focusRef.current?.focus()
  }, [step])

  const signedIn = Boolean(user || session)
  const active = signedIn ? step : 'idle'
  const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? ''
  const answers = faq.filter((item) => item.topic === topic)

  function goTo(next) {
    // A token belongs to a mounted widget; leaving the form discards it.
    if (next !== 'form') {
      setToken(null)
      setWidgetFailed(false)
    }
    setError(null)
    setStep(next)
  }

  function handleToken(next) {
    setToken(next)
    // A widget that recovers on its own (it retries) takes its own warning back.
    if (next) setWidgetFailed(false)
  }

  function startSignin() {
    // Persisted flag first: the modal island may not have hydrated yet, and a live
    // CustomEvent alone would be lost (see SignInModalWrapper).
    window.__signinPending = true
    window.dispatchEvent(new CustomEvent('open-signin'))
  }

  function pickTopic(id) {
    setTopic(id)
    goTo(faq.some((item) => item.topic === id) ? 'answers' : 'form')
  }

  function back() {
    goTo(active === 'form' && answers.length > 0 ? 'answers' : 'topic')
  }

  async function submit(event) {
    event.preventDefault()
    if (!token || sending) return
    const cleanSubject = subject.trim()
    const cleanBody = body.trim()
    if (cleanSubject.length < SUBJECT.min || cleanSubject.length > SUBJECT.max) {
      setError(ticketErrorMessage({ message: 'bad_subject' }))
      return
    }
    if (cleanBody.length < BODY.min || cleanBody.length > BODY.max) {
      setError(ticketErrorMessage({ message: 'bad_body' }))
      return
    }
    setError(null)
    setSending(true)
    try {
      await openTicket({ topic, subject: cleanSubject, body: cleanBody, captchaToken: token })
      setSubject('')
      setBody('')
      setToken(null)
      setStep('sent')
    } catch (e) {
      setError(ticketErrorMessage(e))
      // The token was spent on this attempt; ask the widget for a new one.
      setToken(null)
      setResetKey((k) => k + 1)
    } finally {
      setSending(false)
    }
  }

  // A send or validation error wins; the widget sentence fills in when there is none, so
  // typing in the fields (which clears `error`) never leaves Send disabled in silence.
  const alertText = error ?? (widgetFailed ? TURNSTILE_FAILED : null)

  let content
  if (active === 'idle') {
    if (isLoading) {
      // Same visible link the server rendered, so hydration matches and nothing jumps.
      content = (
        <a href="#open-ticket" className={PRIMARY}>
          Open a ticket
        </a>
      )
    } else if (!signedIn) {
      content = (
        <button type="button" className={PRIMARY} onClick={startSignin}>
          Sign in to open a ticket
        </button>
      )
    } else {
      content = (
        <button type="button" className={PRIMARY} onClick={() => goTo('topic')}>
          Open a ticket
        </button>
      )
    }
  } else if (active === 'topic') {
    content = (
      <div className="flex flex-col gap-5">
        <h2 ref={focusRef} tabIndex={-1} className={HEADING}>
          What's it about?
        </h2>
        <div className="flex flex-wrap gap-3">
          {TOPICS.map((t) => (
            <button key={t.id} type="button" className={TOPIC_BUTTON} onClick={() => pickTopic(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    )
  } else if (active === 'answers') {
    content = (
      <div className="flex flex-col gap-6">
        <h2 ref={focusRef} tabIndex={-1} className={HEADING}>
          {topicLabel}
        </h2>
        {answers.map((item) => (
          <article key={item.question} className="border-t border-[var(--color-line)] pt-4">
            <h3 className="font-serif font-bold text-lg text-[var(--color-bone)]">{item.question}</h3>
            <div className="prose mt-2" dangerouslySetInnerHTML={{ __html: item.html }} />
          </article>
        ))}
        <div className="flex flex-wrap gap-3">
          <button type="button" className={SECONDARY} onClick={back}>
            Back
          </button>
          <button type="button" className={PRIMARY} onClick={() => goTo('form')}>
            Still need help?
          </button>
        </div>
      </div>
    )
  } else if (active === 'form') {
    content = (
      <form onSubmit={submit} className="flex flex-col gap-5">
        <h2 ref={focusRef} tabIndex={-1} className={HEADING}>
          {topicLabel}
        </h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="ticket-subject" className={LABEL}>
            Subject
          </label>
          <input
            id="ticket-subject"
            type="text"
            maxLength={SUBJECT.max}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value)
              setError(null)
            }}
            aria-describedby="ticket-subject-count"
            className={FIELD}
          />
          <span id="ticket-subject-count" className={COUNT}>{`${subject.length} / ${SUBJECT.max}`}</span>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ticket-body" className={LABEL}>
            Message
          </label>
          <textarea
            id="ticket-body"
            rows={8}
            maxLength={BODY.max}
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              setError(null)
            }}
            aria-describedby="ticket-body-count"
            className={FIELD}
          />
          <span id="ticket-body-count" className={COUNT}>{`${body.length} / ${BODY.max}`}</span>
        </div>
        <Turnstile action="open_ticket" onToken={handleToken} onFail={() => setWidgetFailed(true)} resetKey={resetKey} />
        {alertText && (
          <p role="alert" className="font-serif text-sm text-[var(--color-ember)]">
            {alertText}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="button" className={SECONDARY} onClick={back}>
            Back
          </button>
          <button type="submit" className={PRIMARY} disabled={!token || sending}>
            Send
          </button>
        </div>
      </form>
    )
  } else {
    content = (
      <p ref={focusRef} tabIndex={-1} role="status" className="font-serif text-[var(--color-bone)] outline-none">
        Sent. You'll see the answer here, on <a href="/my-tickets/" className="text-[var(--color-ember)] underline">My tickets</a>, and in your notifications.
      </p>
    )
  }

  return (
    <section id="open-ticket" className="mt-12 border-t border-[var(--color-line)] pt-8">
      {content}
    </section>
  )
}

export default withProviders(OpenTicket)
