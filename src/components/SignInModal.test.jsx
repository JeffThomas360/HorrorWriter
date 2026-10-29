import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest'
import { GATE_KEY, PASSED, BLOCKED } from '../lib/ageGate'

// The age gate exists so the site collects nothing from an under-13 before it
// knows their age. It must stand in front of every path that can CREATE an
// account, and nothing else: an established member signing in on a new browser
// should not be asked for a birth date they already gave (or never needed to).

const signInWithOtp = vi.fn()
const signInWithOAuth = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: { auth: { signInWithOtp: (...a) => signInWithOtp(...a), signInWithOAuth: (...a) => signInWithOAuth(...a) } },
}))
vi.mock('../lib/passkey', () => ({ signInWithPasskey: vi.fn(), prefetchPasskeyChallenge: vi.fn() }))

// The widget is mocked: the test plays the part of Cloudflare by calling onToken.
let turnstileProps
const turnstileKeys = []
vi.mock('./Turnstile', () => ({
  default: (props) => {
    turnstileProps = props
    if (turnstileKeys[turnstileKeys.length - 1] !== props.resetKey) turnstileKeys.push(props.resetKey)
    return <div data-testid="turnstile" />
  },
}))

const SignInModal = (await import('./SignInModal')).default

const NEUTRAL = 'If that email has an account, a sign-in link is on its way. Check your inbox (and spam).'
const LINK_SENT = 'Link sent. Check your inbox (and spam) and click it to sign in.'
const TURNSTILE_FAILED = "We couldn't confirm you're a person. Refresh the page and try again."

function open() {
  return render(<SignInModal isOpen onClose={() => {}} />)
}

// The email field is collapsed behind a link until the writer asks for it.
async function revealEmail() {
  fireEvent.click(await screen.findByRole('button', { name: /email me a sign-in link/i }))
  return screen.findByLabelText(/email address/i)
}

// Plays Cloudflare passing the visitor, which is what enables the email button.
function passTurnstile(token = 'tok') {
  act(() => turnstileProps.onToken(token))
}

const sendButton = () => screen.getByRole('button', { name: /^email me a sign-in link$/i })

// Reveal the email field, type an address, get a token, press send.
async function sendLink(address = 'member@example.com') {
  fireEvent.change(await revealEmail(), { target: { value: address } })
  passTurnstile()
  fireEvent.click(sendButton())
}

function passGate() {
  fireEvent.change(screen.getByLabelText('Month'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1980' } })
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
}

beforeEach(() => {
  localStorage.clear()
  turnstileProps = undefined
  turnstileKeys.length = 0
  signInWithOtp.mockReset().mockResolvedValue({ error: null })
  signInWithOAuth.mockReset().mockResolvedValue({ data: { url: null }, error: null })
  vi.stubEnv('VITE_ENABLE_GOOGLE_LOGIN', 'true')
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('SignInModal age gate', () => {
  test('a browser with no verdict opens on sign-in, not the birth-date screen', async () => {
    open()
    expect(await screen.findByRole('button', { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with passkey/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/email address/i)).toBeNull()
    expect(screen.queryByLabelText('Month')).toBeNull()
  })

  test('without a verdict, the email link can only sign in, never create an account', async () => {
    open()
    await sendLink()
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled())
    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false)
  })

  test('Google goes through the age gate first on a browser with no verdict', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: /continue with google/i }))
    expect(await screen.findByLabelText('Month')).toBeInTheDocument()
    expect(signInWithOAuth).not.toHaveBeenCalled()
  })

  test('creating an account asks for a birth date, then allows account creation', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: /create an account/i }))
    expect(await screen.findByLabelText('Month')).toBeInTheDocument()
    passGate()
    await sendLink('new@example.com')
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled())
    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(true)
    expect(localStorage.getItem(GATE_KEY)).toBe(PASSED)
  })

  test('a browser that failed the gate stays shut, sign-in included', async () => {
    localStorage.setItem(GATE_KEY, BLOCKED)
    open()
    expect(await screen.findByText(/door stays/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/email address/i)).toBeNull()
  })

  test('a browser that passed goes straight to every method', async () => {
    localStorage.setItem(GATE_KEY, PASSED)
    open()
    fireEvent.click(await screen.findByRole('button', { name: /continue with google/i }))
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalled())
  })

  // Without prompt=select_account Google silently reuses whichever account
  // the browser last signed in with, so members with several Google accounts
  // can't choose.
  test('Google always shows its account chooser', async () => {
    localStorage.setItem(GATE_KEY, PASSED)
    open()
    fireEvent.click(await screen.findByRole('button', { name: /continue with google/i }))
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalled())
    expect(signInWithOAuth.mock.calls[0][0].options.queryParams).toEqual({ prompt: 'select_account' })
  })

  // Opened after an await, the popup is blocked by Safari, Firefox and phones.
  test('Google opens its popup inside the click, before the OAuth request', async () => {
    localStorage.setItem(GATE_KEY, PASSED)
    const order = []
    const popup = { closed: false, location: { href: '' }, close: vi.fn() }
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => { order.push('open'); return popup })
    signInWithOAuth.mockImplementation(async () => { order.push('oauth'); return { data: { url: 'https://accounts.google.com/x' }, error: null } })
    open()
    fireEvent.click(await screen.findByRole('button', { name: /continue with google/i }))
    await waitFor(() => expect(popup.location.href).toBe('https://accounts.google.com/x'))
    expect(order).toEqual(['open', 'oauth'])
    openSpy.mockRestore()
  })

  test('a blocked popup falls back to signing in in the same tab', async () => {
    localStorage.setItem(GATE_KEY, PASSED)
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const assign = vi.fn()
    const realLocation = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, origin: realLocation.origin, pathname: '/forum/', search: '', hash: '', assign } })
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/y' }, error: null })
    open()
    fireEvent.click(await screen.findByRole('button', { name: /continue with google/i }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.google.com/y'))
    expect(JSON.parse(localStorage.getItem('hw_return_to')).p).toBe('/forum/')
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
    openSpy.mockRestore()
  })

  test('order is Google, passkey, then the email link; the field appears only on request', async () => {
    localStorage.setItem(GATE_KEY, PASSED)
    open()
    const buttons = (await screen.findAllByRole('button')).map((b) => b.textContent.trim())
    const idx = (re) => buttons.findIndex((t) => re.test(t))
    expect(idx(/continue with google/i)).toBeLessThan(idx(/sign in with passkey/i))
    expect(idx(/sign in with passkey/i)).toBeLessThan(idx(/email me a sign-in link/i))
    expect(screen.queryByLabelText(/email address/i)).toBeNull()
    expect(await revealEmail()).toBeInTheDocument()
  })
})

// The email link is the way back in for a member who is locked out of Google and
// passkeys, so it must work for them without ever telling a stranger whether an
// address has an account.
describe('SignInModal "Can\'t sign in?" email link', () => {
  test('the collapsed link reads Can\'t sign in? Email me a sign-in link', async () => {
    open()
    expect(await screen.findByRole('button', { name: "Can't sign in? Email me a sign-in link" })).toBeInTheDocument()
    expect(screen.queryByText(/no google or passkey/i)).toBeNull()
  })

  test('the email link lands on /auth/callback?via=email, so the callback knows how they came in', async () => {
    open()
    await sendLink()
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled())
    expect(signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(window.location.origin + '/auth/callback?via=email')
    expect(signInWithOtp.mock.calls[0][0].options.emailRedirectTo.endsWith('/auth/callback?via=email')).toBe(true)
  })

  test('an address with no account gets the same neutral sentence, and is never told so', async () => {
    signInWithOtp.mockResolvedValue({ error: { code: 'otp_disabled', message: 'Signups not allowed for otp' } })
    open()
    await sendLink('new@example.com')
    expect(await screen.findByText(NEUTRAL)).toBeInTheDocument()
    expect(screen.queryByText(/no account uses that email/i)).toBeNull()
  })

  test('a "signups not allowed" message without a code is treated the same way', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'Signups not allowed for this instance' } })
    open()
    await sendLink('new@example.com')
    expect(await screen.findByText(NEUTRAL)).toBeInTheDocument()
    expect(screen.queryByText(/signups not allowed/i)).toBeNull()
  })

  test('a success says the same neutral sentence while the browser has not passed the gate', async () => {
    open()
    await sendLink()
    expect(await screen.findByText(NEUTRAL)).toBeInTheDocument()
    expect(screen.queryByText(LINK_SENT)).toBeNull()
  })

  test('creating an account (gate passed) keeps its own success copy', async () => {
    localStorage.setItem(GATE_KEY, PASSED)
    open()
    await sendLink('new@example.com')
    expect(await screen.findByText(LINK_SENT)).toBeInTheDocument()
    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(true)
  })

  test('New here? Create an account is visible before anything is submitted, and opens the age gate', async () => {
    open()
    const create = await screen.findByRole('button', { name: 'New here? Create an account' })
    expect(create).toBeVisible()
    expect(screen.getAllByText('New here? Create an account')).toHaveLength(1)
    fireEvent.click(create)
    expect(await screen.findByLabelText('Month')).toBeInTheDocument()
  })

  test('the neutral answer leaves New here? Create an account as the one way to a new account', async () => {
    signInWithOtp.mockResolvedValue({ error: { code: 'otp_disabled', message: 'Signups not allowed for otp' } })
    open()
    await sendLink('new@example.com')
    await screen.findByText(NEUTRAL)
    expect(screen.getAllByText('New here? Create an account')).toHaveLength(1)
  })
})

describe('SignInModal Turnstile on the email link', () => {
  test('Google and passkey get no widget, and work with no token', async () => {
    open()
    const google = await screen.findByRole('button', { name: /continue with google/i })
    const passkey = screen.getByRole('button', { name: /sign in with passkey/i })
    expect(screen.queryByTestId('turnstile')).toBeNull()
    expect(google).toBeEnabled()
    expect(passkey).toBeEnabled()

    // Even with the email form open and no token yet, those two stay usable.
    await revealEmail()
    expect(screen.getAllByTestId('turnstile')).toHaveLength(1)
    expect(sendButton()).toBeDisabled()
    expect(google).toBeEnabled()
    expect(passkey).toBeEnabled()
  })

  test('the widget is the email_link one, above the submit button', async () => {
    open()
    await revealEmail()
    expect(turnstileProps.action).toBe('email_link')
    const widget = screen.getByTestId('turnstile')
    expect(widget.compareDocumentPosition(sendButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('sign-up mode (gate passed) has the widget too', async () => {
    localStorage.setItem(GATE_KEY, PASSED)
    open()
    await revealEmail()
    expect(screen.getByTestId('turnstile')).toBeInTheDocument()
    expect(turnstileProps.action).toBe('email_link')
    expect(sendButton()).toBeDisabled()
  })

  test('send waits for a token, then hands it to Supabase as captchaToken', async () => {
    open()
    fireEvent.change(await revealEmail(), { target: { value: 'member@example.com' } })
    expect(sendButton()).toBeDisabled()
    fireEvent.click(sendButton())
    expect(signInWithOtp).not.toHaveBeenCalled()

    passTurnstile('tok')
    expect(sendButton()).toBeEnabled()
    fireEvent.click(sendButton())
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1))
    expect(signInWithOtp.mock.calls[0][0].options.captchaToken).toBe('tok')
    expect(signInWithOtp.mock.calls[0][0].email).toBe('member@example.com')
  })

  test('losing the token (expired, errored) disables send again', async () => {
    open()
    await revealEmail()
    passTurnstile('tok')
    expect(sendButton()).toBeEnabled()
    passTurnstile(null)
    expect(sendButton()).toBeDisabled()
  })

  test('a captcha error shows the Turnstile sentence, not the raw one, and asks for a fresh token', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'captcha verification process failed' } })
    open()
    await sendLink()
    expect(await screen.findByText(TURNSTILE_FAILED)).toBeInTheDocument()
    expect(screen.queryByText(/captcha verification process failed/i)).toBeNull()
    // the spent token is gone and the widget was told to start over
    await waitFor(() => expect(turnstileKeys.length).toBeGreaterThan(1))
    expect(sendButton()).toBeDisabled()

    // a fresh token lets them try again, and the old error goes away once they do
    signInWithOtp.mockResolvedValue({ error: null })
    passTurnstile('tok-2')
    fireEvent.click(sendButton())
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(2))
    expect(signInWithOtp.mock.calls[1][0].options.captchaToken).toBe('tok-2')
    await waitFor(() => expect(screen.queryByText(TURNSTILE_FAILED)).toBeNull())
  })

  test('a token is good for one send: the widget is reset after every attempt', async () => {
    open()
    await revealEmail()
    const before = turnstileProps.resetKey
    passTurnstile('tok')
    fireEvent.click(sendButton())
    await screen.findByText(NEUTRAL)
    await waitFor(() => expect(turnstileProps.resetKey).not.toBe(before))
    expect(sendButton()).toBeDisabled()
  })

  test('a different error is still shown as the error it is', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } })
    open()
    await sendLink()
    expect(await screen.findByText('Email rate limit exceeded')).toBeInTheDocument()
    expect(screen.queryByText(TURNSTILE_FAILED)).toBeNull()
  })

  test('leaving the email form drops the token, so a stale one cannot be sent from a new widget', async () => {
    open()
    await revealEmail()
    passTurnstile('tok')
    expect(sendButton()).toBeEnabled()

    // To the age gate and back: the form (and its widget) unmounts and remounts.
    fireEvent.click(screen.getByRole('button', { name: 'New here? Create an account' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Already a member? Sign in' }))
    await screen.findByLabelText(/email address/i)
    expect(sendButton()).toBeDisabled()
  })
})


// If the widget can never produce a token (script blocked, challenge errored or timed
// out), the member must be told, and must not be locked out of the one path back in.
// Supabase Auth's captcha is the real guard: once it is on, a token-less request is
// refused there and the same sentence comes back.
describe('SignInModal when the Turnstile widget fails', () => {
  // What the real widget does: onToken(null), then onFail().
  const failTurnstile = () =>
    act(() => {
      turnstileProps.onToken(null)
      turnstileProps.onFail()
    })

  test('the widget is given an onFail handler', async () => {
    open()
    await revealEmail()
    expect(typeof turnstileProps.onFail).toBe('function')
  })

  test('shows the Turnstile sentence', async () => {
    open()
    await revealEmail()
    expect(screen.queryByText(TURNSTILE_FAILED)).toBeNull()
    failTurnstile()
    expect(screen.getByText(TURNSTILE_FAILED)).toBeInTheDocument()
  })

  test('lets the email be sent without a token, and the call carries no captchaToken', async () => {
    open()
    fireEvent.change(await revealEmail(), { target: { value: 'member@example.com' } })
    expect(sendButton()).toBeDisabled()
    failTurnstile()
    expect(sendButton()).toBeEnabled()

    fireEvent.click(sendButton())
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1))
    const { options, email } = signInWithOtp.mock.calls[0][0]
    expect(email).toBe('member@example.com')
    expect('captchaToken' in options).toBe(false)
    expect(options.shouldCreateUser).toBe(false)
    expect(options.emailRedirectTo.endsWith('/auth/callback?via=email')).toBe(true)
    expect(await screen.findByText(NEUTRAL)).toBeInTheDocument()
  })

  test('stays open for another try while the widget stays broken', async () => {
    open()
    fireEvent.change(await revealEmail(), { target: { value: 'member@example.com' } })
    failTurnstile()
    fireEvent.click(sendButton())
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1))
    await screen.findByText(NEUTRAL)
    expect(sendButton()).toBeEnabled()
    fireEvent.click(sendButton())
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(2))
  })

  test('once Supabase enforces captcha, the token-less request is refused and the same sentence appears', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'captcha protection: request disallowed (no-captcha-response)' } })
    open()
    fireEvent.change(await revealEmail(), { target: { value: 'member@example.com' } })
    failTurnstile()
    fireEvent.click(sendButton())
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1))
    expect('captchaToken' in signInWithOtp.mock.calls[0][0].options).toBe(false)
    expect(await screen.findByText(TURNSTILE_FAILED)).toBeInTheDocument()
    expect(screen.queryByText(/no-captcha-response/i)).toBeNull()
  })

  test('a token that arrives later clears the sentence and is the one that gets sent', async () => {
    open()
    fireEvent.change(await revealEmail(), { target: { value: 'member@example.com' } })
    failTurnstile()
    expect(screen.getByText(TURNSTILE_FAILED)).toBeInTheDocument()

    passTurnstile('tok-late')
    expect(screen.queryByText(TURNSTILE_FAILED)).toBeNull()
    fireEvent.click(sendButton())
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1))
    expect(signInWithOtp.mock.calls[0][0].options.captchaToken).toBe('tok-late')
  })

  test('only a widget failure unlocks a token-less send: an expired token still needs a new one', async () => {
    open()
    await revealEmail()
    passTurnstile('tok')
    passTurnstile(null)
    expect(sendButton()).toBeDisabled()
  })

  test('a fresh widget starts clean: leaving and returning to the form forgets the failure', async () => {
    open()
    await revealEmail()
    failTurnstile()
    expect(sendButton()).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'New here? Create an account' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Already a member? Sign in' }))
    await screen.findByLabelText(/email address/i)
    expect(sendButton()).toBeDisabled()
  })

  test('Google and passkey are unaffected', async () => {
    open()
    await revealEmail()
    failTurnstile()
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /sign in with passkey/i })).toBeEnabled()
  })
})

// For an address that already has an account, GoTrue's per-address frequency limit
// answers with its own error, and only then. Passed on raw it would tell a stranger
// the address has an account, so it gets the same neutral sentence (a link really was
// sent a moment ago). The project-wide limit does not depend on the account.
describe('SignInModal per-address rate limit', () => {
  const TOO_SOON = { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.' }

  test('is answered with the neutral sentence while the browser has not passed the gate', async () => {
    signInWithOtp.mockResolvedValue({ error: TOO_SOON })
    open()
    await sendLink()
    expect(await screen.findByText(NEUTRAL)).toBeInTheDocument()
    expect(screen.queryByText(/only request this after/i)).toBeNull()
    expect(screen.queryByText(/for security purposes/i)).toBeNull()
  })

  test('matches on the message, not the wording around it', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'FOR SECURITY PURPOSES, YOU CAN ONLY REQUEST THIS AFTER 5 SECONDS.' } })
    open()
    await sendLink()
    expect(await screen.findByText(NEUTRAL)).toBeInTheDocument()
  })

  test('is left as it is when the browser has passed the gate (that path creates accounts)', async () => {
    localStorage.setItem(GATE_KEY, PASSED)
    signInWithOtp.mockResolvedValue({ error: TOO_SOON })
    open()
    await sendLink('new@example.com')
    expect(await screen.findByText(TOO_SOON.message)).toBeInTheDocument()
    expect(screen.queryByText(NEUTRAL)).toBeNull()
  })

  test('the project-wide limit does not depend on the account, so it stays as it is', async () => {
    signInWithOtp.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' } })
    open()
    await sendLink()
    expect(await screen.findByText('Email rate limit exceeded')).toBeInTheDocument()
    expect(screen.queryByText(NEUTRAL)).toBeNull()
  })
})

// R18: the callback only offers the add-a-passkey nudge to a browser that itself asked
// for an email link a moment ago, so the modal leaves a time marker when a link goes out.
// It is the same whatever the answer on screen, so it cannot be used to tell accounts apart.
describe('SignInModal marks this browser as having asked for an email link', () => {
  const MARKER = 'hw:emailLinkRequestedAt'

  test('after a successful send, with a time that is now', async () => {
    const before = Date.now()
    open()
    await sendLink()
    await screen.findByText(NEUTRAL)
    const at = Number(localStorage.getItem(MARKER))
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(Date.now())
  })

  test('also when creating an account (gate passed)', async () => {
    localStorage.setItem(GATE_KEY, PASSED)
    open()
    await sendLink('new@example.com')
    await screen.findByText(LINK_SENT)
    expect(Number(localStorage.getItem(MARKER))).toBeGreaterThan(0)
  })

  test('also when the per-address limit is mapped to the neutral sentence (a link went out a moment ago)', async () => {
    signInWithOtp.mockResolvedValue({
      error: { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.' },
    })
    open()
    await sendLink()
    await screen.findByText(NEUTRAL)
    expect(Number(localStorage.getItem(MARKER))).toBeGreaterThan(0)
  })

  test('also for a token-less send after a widget failure', async () => {
    open()
    fireEvent.change(await revealEmail(), { target: { value: 'member@example.com' } })
    act(() => {
      turnstileProps.onToken(null)
      turnstileProps.onFail()
    })
    fireEvent.click(sendButton())
    await screen.findByText(NEUTRAL)
    expect(Number(localStorage.getItem(MARKER))).toBeGreaterThan(0)
  })

  // R20: the honeypot's fake success reads exactly like the real answer for this gate, so
  // a bot can't tell it was caught.
  test('not on the honeypot path, where nothing is sent and the answer is the real one (gate not passed)', async () => {
    const { container } = open()
    fireEvent.change(await revealEmail(), { target: { value: 'bot@example.com' } })
    fireEvent.change(container.querySelector('input[name="website_url_hp"]'), { target: { value: 'http://spam.example' } })
    passTurnstile()
    fireEvent.click(sendButton())
    expect(await screen.findByText(NEUTRAL)).toBeInTheDocument()
    expect(screen.queryByText(/magic link/i)).toBeNull()
    expect(signInWithOtp).not.toHaveBeenCalled()
    expect(localStorage.getItem(MARKER)).toBeNull()
  })

  test('not on the honeypot path with the gate passed either, where it reads like a real account creation', async () => {
    localStorage.setItem(GATE_KEY, PASSED)
    const { container } = open()
    fireEvent.change(await revealEmail(), { target: { value: 'bot@example.com' } })
    fireEvent.change(container.querySelector('input[name="website_url_hp"]'), { target: { value: 'http://spam.example' } })
    passTurnstile()
    fireEvent.click(sendButton())
    expect(await screen.findByText(LINK_SENT)).toBeInTheDocument()
    expect(screen.queryByText(NEUTRAL)).toBeNull()
    expect(signInWithOtp).not.toHaveBeenCalled()
    expect(localStorage.getItem(MARKER)).toBeNull()
  })

  test('not when no link was sent: an unknown address, a captcha refusal, or any other error', async () => {
    for (const error of [
      { code: 'otp_disabled', message: 'Signups not allowed for otp' },
      { message: 'captcha verification process failed' },
      { message: 'Email rate limit exceeded' },
      { message: 'Something else went wrong' },
    ]) {
      localStorage.clear()
      signInWithOtp.mockReset().mockResolvedValue({ error })
      const view = open()
      await sendLink()
      await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(screen.getByRole('button', { name: /^email me a sign-in link$/i })).toBeDisabled())
      expect(localStorage.getItem(MARKER)).toBeNull()
      view.unmount()
    }
  })

  test('not before anything is sent', async () => {
    open()
    await revealEmail()
    passTurnstile()
    expect(localStorage.getItem(MARKER)).toBeNull()
  })

  test('blocked storage does not stop the send from being reported', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    open()
    await sendLink()
    expect(await screen.findByText(NEUTRAL)).toBeInTheDocument()
    setItem.mockRestore()
  })
})
