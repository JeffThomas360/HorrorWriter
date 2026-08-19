// src/components/CommunityGuidelines.test.js
import { render, screen } from '@testing-library/react'
import { test, expect, describe } from 'vitest'
import CommunityGuidelines from './CommunityGuidelines'
import { GUIDELINES_TEXT } from '../lib/communityGuidelines'

describe('CommunityGuidelines', () => {
  test('renders the guidelines heading and body text', () => {
    render(<CommunityGuidelines />)
    expect(screen.getByText(/before you post/i)).toBeInTheDocument()
    expect(screen.getByText(GUIDELINES_TEXT.split('\n')[0])).toBeInTheDocument()
  })

  test('is not dismissible — no close button', () => {
    render(<CommunityGuidelines />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
