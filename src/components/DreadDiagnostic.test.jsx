import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import DreadDiagnostic from './DreadDiagnostic'

vi.mock('../lib/soundscapes', () => ({
  playTypewriterKey: () => {},
  playDreadTone: () => {},
}))

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(cleanup)

test('renders stage 1 of diagnostic by default when no saved state exists', () => {
  render(<DreadDiagnostic />)
  expect(screen.getByText(/STAGE 1 OF 4/i)).toBeInTheDocument()
  expect(screen.getByText(/The First Breach/i)).toBeInTheDocument()
  expect(screen.getByText(/Where does fear strike your body first\?/i)).toBeInTheDocument()
})

test('progressing through all 4 questions saves completed archetype to localStorage', () => {
  render(<DreadDiagnostic />)

  // Question 1: choose option A (cosmic)
  fireEvent.click(screen.getByText(/In the vast, icy realization/i))
  expect(screen.getByText(/STAGE 2 OF 4/i)).toBeInTheDocument()

  // Question 2: choose option A (cosmic)
  fireEvent.click(screen.getByText(/A silhouette that human retinas were never engineered/i))
  expect(screen.getByText(/STAGE 3 OF 4/i)).toBeInTheDocument()

  // Question 3: choose option A (cosmic)
  fireEvent.click(screen.getByText(/The crushing vertigo that human existence was an accidental footnote/i))
  expect(screen.getByText(/STAGE 4 OF 4/i)).toBeInTheDocument()

  // Question 4: choose option A (cosmic)
  fireEvent.click(screen.getByText(/To peer past the veil into the majestic terror of the infinite void/i))

  // Completed view
  expect(screen.getByText(/THE VOID-GAZER/i)).toBeInTheDocument()
  expect(screen.getByText(/DOSSIER GENERATED/i)).toBeInTheDocument()

  const raw = window.localStorage.getItem('hw.dread.diagnostic')
  expect(raw).toBeTruthy()
  const parsed = JSON.parse(raw)
  expect(parsed.archetype).toBe('cosmic')
  expect(parsed.completed).toBe(true)
})

test('returning user with saved archetype sees compact summary card without quiz questions', () => {
  window.localStorage.setItem('hw.dread.diagnostic', JSON.stringify({ archetype: 'cosmic', completed: true }))

  render(<DreadDiagnostic />)

  // Questions are not displayed
  expect(screen.queryByText(/STAGE 1 OF 4/i)).toBeNull()
  expect(screen.queryByText(/Where does fear strike your body first\?/i)).toBeNull()

  // Compact summary is shown
  expect(screen.getByText(/Alignment:/i)).toBeInTheDocument()
  expect(screen.getByText(/THE VOID-GAZER/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /view dossier/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /retake/i })).toBeInTheDocument()
})

test('clicking View Dossier expands the full dossier and Minimize collapses it', () => {
  window.localStorage.setItem('hw.dread.diagnostic', JSON.stringify({ archetype: 'cosmic', completed: true }))

  render(<DreadDiagnostic />)

  fireEvent.click(screen.getByRole('button', { name: /view dossier/i }))
  expect(screen.getByText(/Narrative Affinities/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /minimize/i })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /minimize/i }))
  expect(screen.queryByText(/Narrative Affinities/i)).toBeNull()
  expect(screen.getByRole('button', { name: /view dossier/i })).toBeInTheDocument()
})

test('clicking Retake resets the quiz and clears saved progress in localStorage', () => {
  window.localStorage.setItem('hw.dread.diagnostic', JSON.stringify({ archetype: 'cosmic', completed: true }))

  render(<DreadDiagnostic />)

  fireEvent.click(screen.getByRole('button', { name: /retake/i }))

  expect(screen.getByText(/STAGE 1 OF 4/i)).toBeInTheDocument()
  expect(screen.getByText(/The First Breach/i)).toBeInTheDocument()
  expect(window.localStorage.getItem('hw.dread.diagnostic')).toBeNull()
})
