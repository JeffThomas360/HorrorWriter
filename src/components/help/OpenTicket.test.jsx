import { render, screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

let authState
vi.mock('../AuthContext', () => ({ useAuth: () => authState }))
// Each island is its own root and wraps itself in providers; those are not under test.
vi.mock('../Providers', () => ({ withProviders: (Component) => Component }))

// The widget is mocked: the test plays the part of Cloudflare by calling onToken.
let turnstileProps
const turnstileKeys = []
vi.mock('../Turnstile', () => ({
  default: (props) => {
    turnstileProps = props
    if (turnstileKeys[turnstileKeys.length - 1] !== props.resetKey) turnstileKeys.push(props.resetKey)
    return <div data-testid="turnstile" />
  },
}))

const openTicket = vi.fn()
vi.mock('../../supabaseClient', () => ({ supabase: null }))
vi.mock('../../lib/tickets', async () => {
  const actual = await vi.importActual('../../lib/tickets')
  return { ...actual, openTicket: (...a) => openTicket(...a) }
})

const OpenTicket = (await import('./OpenTicket')).default

const FAQ = [
  { topic: 'rituals', question: 'What is a Midnight Ritual?', html: '<p>A weekly writing prompt.</p>' },
  { topic: 'rituals', question: 'What does Keep it do?', html: '<p>It keeps your entry.</p>' },
  { topic: 'signing-in', question: 'What is a passkey?', html: '<p>A way to sign in.</p>' },
]

const signedIn = { session: { user: { id: 'u1' } }, user: { id: 'u1' }, isLoading: false }
const signedOut = { session: null, user: null, isLoading: false }

const SUBJECT = 'My entry vanished'
const BODY = 'I sent my entry back to the mentor and now it is gone from my list.'

beforeEach(() => {
  authState = signedIn
  turnstileProps = undefined
  turnstileKeys.length = 0
  openTicket.mockReset().mockResolvedValue('ticket-1')
  window.__signinPending = false
})
afterEach(() => cleanup())

function chooseTopic(label) {
  fireEvent.click(screen.getByRole('button', { name: /^open a ticket$/i }))
  fireEvent.click(screen.getByRole('button', { name: label }))
}

function openForm(label = 'Rituals') {
  chooseTopic(label)
  const still = screen.queryByRole('button', { name: /still need help\?/i })
  if (still) fireEvent.click(still)
}

function fillForm() {
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: SUBJECT } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: BODY } })
}

test('the server render shows a visible Open a ticket link that needs no JavaScript', () => {
  authState = { session: null, user: null, isLoading: true }
  const html = renderToString(<OpenTicket faq={FAQ} />)
  expect(html).toContain('Open a ticket')
  expect(html).toMatch(/<a[^>]*href="#open-ticket"[^>]*>Open a ticket<\/a>/)
  expect(html).toContain('id="open-ticket"')
})

test('while the session is still loading it keeps the same visible link', () => {
  authState = { session: null, user: null, isLoading: true }
  render(<OpenTicket faq={FAQ} />)
  expect(screen.getByRole('link', { name: 'Open a ticket' })).toHaveAttribute('href', '#open-ticket')
})

test('signed out: reads Sign in to open a ticket and opens the sign-in modal via the persisted flag', () => {
  authState = signedOut
  const onSignin = vi.fn()
  window.addEventListener('open-signin', onSignin)
  render(<OpenTicket faq={FAQ} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to open a ticket' }))
  window.removeEventListener('open-signin', onSignin)

  expect(window.__signinPending).toBe(true)
  expect(onSignin).toHaveBeenCalledTimes(1)
  expect(screen.queryByText("What's it about?")).not.toBeInTheDocument()
})

test('step 1 offers the six topics', () => {
  render(<OpenTicket faq={FAQ} />)
  fireEvent.click(screen.getByRole('button', { name: /^open a ticket$/i }))
  expect(screen.getByText("What's it about?")).toBeInTheDocument()
  for (const label of ['Signing in', 'My writing', 'Rituals', 'Another member', "Something's broken", 'Other']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  }
})

test('picking Rituals shows only the Rituals questions, answers expanded', () => {
  render(<OpenTicket faq={FAQ} />)
  chooseTopic('Rituals')
  expect(screen.getByText('What is a Midnight Ritual?')).toBeInTheDocument()
  expect(screen.getByText('What does Keep it do?')).toBeInTheDocument()
  expect(screen.getByText('A weekly writing prompt.')).toBeVisible()
  expect(screen.queryByText('What is a passkey?')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
})

test('Still need help? reveals the form', () => {
  render(<OpenTicket faq={FAQ} />)
  chooseTopic('Rituals')
  fireEvent.click(screen.getByRole('button', { name: /still need help\?/i }))
  expect(screen.getByLabelText('Subject')).toBeInTheDocument()
  expect(screen.getByLabelText('Message')).toBeInTheDocument()
  expect(screen.getByTestId('turnstile')).toBeInTheDocument()
})

test('a topic with no FAQ goes straight to the form', () => {
  render(<OpenTicket faq={FAQ} />)
  chooseTopic('Other')
  expect(screen.queryByRole('button', { name: /still need help\?/i })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Subject')).toBeInTheDocument()
})

test('the fields cap their length and show live character counts', () => {
  render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  const subject = screen.getByLabelText('Subject')
  const message = screen.getByLabelText('Message')
  expect(subject).toHaveAttribute('maxlength', '120')
  expect(message).toHaveAttribute('maxlength', '2000')
  expect(screen.getByText('0 / 120')).toBeInTheDocument()
  expect(screen.getByText('0 / 2000')).toBeInTheDocument()
  fireEvent.change(subject, { target: { value: SUBJECT } })
  fireEvent.change(message, { target: { value: BODY } })
  expect(screen.getByText(`${SUBJECT.length} / 120`)).toBeInTheDocument()
  expect(screen.getByText(`${BODY.length} / 2000`)).toBeInTheDocument()
})

test('the widget is the open_ticket one', () => {
  render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  expect(turnstileProps.action).toBe('open_ticket')
})

test('Send waits for a token, then sends the ticket with it', async () => {
  render(<OpenTicket faq={FAQ} />)
  openForm('Rituals')
  fillForm()
  const send = screen.getByRole('button', { name: 'Send' })
  expect(send).toBeDisabled()

  act(() => turnstileProps.onToken('tok'))
  expect(send).toBeEnabled()
  fireEvent.click(send)

  await waitFor(() =>
    expect(openTicket).toHaveBeenCalledWith({ topic: 'rituals', subject: SUBJECT, body: BODY, captchaToken: 'tok' }),
  )
  expect(openTicket).toHaveBeenCalledTimes(1)
})

test('losing the token (expired, errored) disables Send again', () => {
  render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  fillForm()
  act(() => turnstileProps.onToken('tok'))
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  act(() => turnstileProps.onToken(null))
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
})

// A widget that can never produce a token must not leave Send disabled without a word.
// The server always requires a token, so Send stays disabled; the member is told why.
test('a widget failure says so, as an alert, and Send stays disabled', () => {
  render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  fillForm()
  expect(typeof turnstileProps.onFail).toBe('function')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()

  act(() => {
    turnstileProps.onToken(null)
    turnstileProps.onFail()
  })
  expect(screen.getByRole('alert')).toHaveTextContent("We couldn't confirm you're a person. Refresh the page and try again.")
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  expect(openTicket).not.toHaveBeenCalled()
})

test('the widget-failure sentence survives editing the fields', () => {
  render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  act(() => turnstileProps.onFail())
  fillForm()
  expect(screen.getByRole('alert')).toHaveTextContent("We couldn't confirm you're a person. Refresh the page and try again.")
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
})

test('a token that arrives after a widget failure clears the sentence and lets Send through', async () => {
  render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  fillForm()
  act(() => turnstileProps.onFail())
  expect(screen.getByRole('alert')).toBeInTheDocument()

  act(() => turnstileProps.onToken('tok'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(openTicket).toHaveBeenCalledWith(expect.objectContaining({ captchaToken: 'tok' })))
})

test('success thanks the member and links to My tickets', async () => {
  render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  fillForm()
  act(() => turnstileProps.onToken('tok'))
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))

  const status = await screen.findByRole('status')
  expect(status).toHaveTextContent("Sent. You'll see the answer here, on My tickets, and in your notifications.")
  expect(within(status).getByRole('link', { name: 'My tickets' })).toHaveAttribute('href', '/my-tickets/')
  expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
})

test('a rejected send shows the reason, asks for a fresh token, and disables Send again', async () => {
  openTicket.mockRejectedValueOnce(new Error('You have 3 open tickets. You can open another once one is closed.'))
  render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  fillForm()
  const before = turnstileProps.resetKey
  act(() => turnstileProps.onToken('tok'))
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('You have 3 open tickets. You can open another once one is closed.')
  await waitFor(() => expect(turnstileProps.resetKey).not.toBe(before))
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  // what the member typed is kept for the next try
  expect(screen.getByLabelText('Subject')).toHaveValue(SUBJECT)
  expect(screen.getByLabelText('Message')).toHaveValue(BODY)

  // a fresh token lets them try again, and the old error goes away once they do
  act(() => turnstileProps.onToken('tok-2'))
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(openTicket).toHaveBeenLastCalledWith(expect.objectContaining({ captchaToken: 'tok-2' })))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})

test('server error keys the client does not know are shown as plain sentences', async () => {
  openTicket.mockRejectedValueOnce(new Error("You've opened 3 tickets today. Try again tomorrow."))
  render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  fillForm()
  act(() => turnstileProps.onToken('tok'))
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("You've opened 3 tickets today. Try again tomorrow.")
})

test('a message the server would refuse for length is caught first, without spending the token', () => {
  render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: SUBJECT } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'too short' } })
  act(() => turnstileProps.onToken('tok'))
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Write between 20 and 2,000 characters.')
  expect(openTicket).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
})

test('Back returns to the topics from the answers and from the form', () => {
  render(<OpenTicket faq={FAQ} />)
  chooseTopic('Rituals')
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByText("What's it about?")).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Other' }))
  expect(screen.getByLabelText('Subject')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByText("What's it about?")).toBeInTheDocument()
})

// R25: a shared device. Nothing one member typed may be on screen for the next one.
const memberA = { session: { user: { id: 'uA' } }, user: { id: 'uA' }, isLoading: false }
const memberB = { session: { user: { id: 'uB' } }, user: { id: 'uB' }, isLoading: false }

function draftAsA() {
  authState = memberA
  const view = render(<OpenTicket faq={FAQ} />)
  openForm('Other')
  fillForm()
  act(() => turnstileProps.onToken('tok'))
  act(() => turnstileProps.onFail())
  expect(screen.getByLabelText('Subject')).toHaveValue(SUBJECT)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  return view
}

function expectEmptyStart() {
  // Back at the start: the Open a ticket button, not A's form.
  expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^open a ticket$/i }))
  expect(screen.getByText("What's it about?")).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Other' }))
  expect(screen.getByLabelText('Subject')).toHaveValue('')
  expect(screen.getByLabelText('Message')).toHaveValue('')
  expect(screen.getByText('0 / 120')).toBeInTheDocument()
  expect(screen.getByText('0 / 2000')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  // A's token is gone: Send waits for B's own.
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
}

test('A drafts, signs out, B signs in: B starts with an empty form at the topic step', () => {
  const { rerender } = draftAsA()
  const keyBefore = turnstileProps.resetKey

  authState = signedOut
  rerender(<OpenTicket faq={FAQ} />)
  expect(screen.getByRole('button', { name: 'Sign in to open a ticket' })).toBeInTheDocument()

  authState = memberB
  rerender(<OpenTicket faq={FAQ} />)
  expectEmptyStart()
  expect(turnstileProps.resetKey).not.toBe(keyBefore)
})

test('A signs out and back in: the form starts over for them too', () => {
  const { rerender } = draftAsA()
  authState = signedOut
  rerender(<OpenTicket faq={FAQ} />)
  authState = memberA
  rerender(<OpenTicket faq={FAQ} />)
  expectEmptyStart()
})

test('a switch from one member straight to another resets the form as well', () => {
  const { rerender } = draftAsA()
  authState = memberB
  rerender(<OpenTicket faq={FAQ} />)
  expectEmptyStart()
})

test('a refreshed session for the same member keeps the draft', () => {
  const { rerender } = draftAsA()
  // A token refresh hands out new objects for the same account.
  authState = { session: { user: { id: 'uA' } }, user: { id: 'uA' }, isLoading: false }
  rerender(<OpenTicket faq={FAQ} />)
  expect(screen.getByLabelText('Subject')).toHaveValue(SUBJECT)
  expect(screen.getByLabelText('Message')).toHaveValue(BODY)
})

test('answer html comes from the build and is the only thing rendered as html', () => {
  const faq = [{ topic: 'rituals', question: 'Q one?', html: '<p>Answer with <strong>bold</strong>.</p>' }]
  const { container } = render(<OpenTicket faq={faq} />)
  chooseTopic('Rituals')
  expect(container.querySelector('strong')).toHaveTextContent('bold')
  // member text goes in as a value, never as markup
  fireEvent.click(screen.getByRole('button', { name: /still need help\?/i }))
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: '<img src=x onerror=alert(1)>' } })
  expect(container.querySelector('img')).toBeNull()
})
