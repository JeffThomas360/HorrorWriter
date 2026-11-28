import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const api = vi.hoisted(() => ({ turnOffByToken: vi.fn() }))
vi.mock('../lib/emailPref', async (orig) => ({ ...(await orig()), turnOffByToken: api.turnOffByToken }))

const { default: EmailOff } = await import('./EmailOff')

const TOKEN = '0a1b2c3d-0000-4000-8000-00000000abcd'
const visit = (search) => window.history.replaceState({}, '', `/email-off/${search}`)

beforeEach(() => api.turnOffByToken.mockReset())
afterEach(() => { cleanup(); visit('') })

test('does nothing until the button is clicked', async () => {
  visit(`?t=${TOKEN}`)
  render(<EmailOff />)
  expect(await screen.findByRole('button', { name: 'Turn these emails off' })).toBeEnabled()
  expect(api.turnOffByToken).not.toHaveBeenCalled()
})

test('turns the emails off with the token from the link', async () => {
  visit(`?t=${TOKEN}`)
  api.turnOffByToken.mockResolvedValue(true)
  render(<EmailOff />)
  fireEvent.click(await screen.findByRole('button', { name: 'Turn these emails off' }))
  expect(await screen.findByRole('status')).toHaveTextContent("We won't email you")
  expect(api.turnOffByToken).toHaveBeenCalledWith(TOKEN)
})

test('says so when the token is not recognised, and points to the profile', async () => {
  visit(`?t=${TOKEN}`)
  api.turnOffByToken.mockResolvedValue(false)
  render(<EmailOff />)
  fireEvent.click(await screen.findByRole('button', { name: 'Turn these emails off' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("That didn't work")
  expect(screen.getByRole('link', { name: 'your profile' })).toHaveAttribute('href', '/profile/')
})

test('a link with no code offers the profile instead of a button', async () => {
  visit('')
  render(<EmailOff />)
  expect(await screen.findByRole('alert')).toHaveTextContent('missing its code')
  expect(screen.queryByRole('button')).toBeNull()
})
