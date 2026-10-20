import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
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
vi.mock('../lib/passkey', () => ({ signInWithPasskey: vi.fn() }))

const SignInModal = (await import('./SignInModal')).default

function open() {
  return render(<SignInModal isOpen onClose={() => {}} />)
}

// The email field is collapsed behind a link until the writer asks for it.
async function revealEmail() {
  fireEvent.click(await screen.findByRole('button', { name: /email me a sign-in link/i }))
  return screen.findByLabelText(/email address/i)
}

function passGate() {
  fireEvent.change(screen.getByLabelText('Month'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1980' } })
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
}

beforeEach(() => {
  localStorage.clear()
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
    fireEvent.change(await revealEmail(), { target: { value: 'member@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^email me a sign-in link$/i }))
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled())
    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false)
  })

  test('an unknown email is pointed to account creation', async () => {
    signInWithOtp.mockResolvedValue({ error: { code: 'otp_disabled', message: 'Signups not allowed for otp' } })
    open()
    fireEvent.change(await revealEmail(), { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^email me a sign-in link$/i }))
    expect(await screen.findByText(/no account uses that email/i)).toBeInTheDocument()
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
    fireEvent.change(await revealEmail(), { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^email me a sign-in link$/i }))
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

