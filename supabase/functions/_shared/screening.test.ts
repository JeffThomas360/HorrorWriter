import { describe, it, expect } from 'vitest'
import { SCREEN_QUESTIONS, buildState, parseAnswers, decide, THRESHOLDS } from './screening'

const answers = (over: Record<string, number> = {}) => ({
  sexual_minors: 0.01,
  harassment: 0.01,
  hate_speech: 0.01,
  real_threat: 0.01,
  ...over,
})

describe('SCREEN_QUESTIONS', () => {
  it('asks one yes/no per condition, each with its own threshold', () => {
    const ids = Object.keys(SCREEN_QUESTIONS)
    expect(ids.sort()).toEqual(['harassment', 'hate_speech', 'real_threat', 'sexual_minors'])
    for (const id of ids) {
      expect(SCREEN_QUESTIONS[id as keyof typeof SCREEN_QUESTIONS].type).toBe('noul')
      expect(THRESHOLDS[id as keyof typeof THRESHOLDS]).toBeGreaterThan(0)
    }
  })
})

describe('buildState', () => {
  it('tells the judge this is horror fiction and the text is untrusted data', () => {
    const s = buildState('story', 'Blood everywhere.')
    expect(s.content).toBe('Blood everywhere.')
    expect(s.kind).toBe('story')
    expect(s.site).toMatch(/horror/i)
    expect(s.site).toMatch(/untrusted|not instructions/i)
  })
})

describe('parseAnswers', () => {
  it('reads each noul probability', () => {
    const raw = { answers: Object.fromEntries(Object.entries(answers()).map(([k, v]) => [k, { type: 'noul', noul: v }])) }
    expect(parseAnswers(raw)).toEqual(answers())
  })
  it('throws when a question is missing, so the caller fails closed', () => {
    expect(() => parseAnswers({ answers: { harassment: { type: 'noul', noul: 0.1 } } })).toThrow()
  })
  it('throws on a non-numeric or out-of-range probability', () => {
    const bad = (v: unknown) => ({ answers: { ...Object.fromEntries(Object.keys(answers()).map((k) => [k, { noul: 0.1 }])), harassment: { noul: v } } })
    expect(() => parseAnswers(bad('high'))).toThrow()
    expect(() => parseAnswers(bad(1.5))).toThrow()
    expect(() => parseAnswers(bad(NaN))).toThrow()
  })
  it('throws on a garbage body', () => {
    expect(() => parseAnswers(null)).toThrow()
    expect(() => parseAnswers({})).toThrow()
  })
})

describe('decide', () => {
  it('passes ordinary and gory fiction', () => {
    expect(decide(answers({ harassment: 0.08, real_threat: 0.08 }))).toEqual({ action: 'pass' })
  })
  it('screens content at or over a threshold and names every question that tripped', () => {
    const d = decide(answers({ harassment: 0.96, real_threat: 0.87 }))
    expect(d.action).toBe('screen')
    if (d.action === 'screen') {
      expect(d.tripped).toEqual(['harassment', 'real_threat'])
      expect(d.reason).toContain('harassment 0.96')
      expect(d.reason).toContain('real_threat 0.87')
      expect(d.worstTier).toBe(false)
    }
  })
  it('does not screen just under a threshold', () => {
    expect(decide(answers({ harassment: THRESHOLDS.harassment - 0.01 })).action).toBe('pass')
    expect(decide(answers({ harassment: THRESHOLDS.harassment })).action).toBe('screen')
  })
  it('flags sexual content involving minors as worst tier, at a lower bar than the rest', () => {
    expect(THRESHOLDS.sexual_minors).toBeLessThan(THRESHOLDS.harassment)
    const d = decide(answers({ sexual_minors: THRESHOLDS.sexual_minors }))
    expect(d.action).toBe('screen')
    if (d.action === 'screen') {
      expect(d.worstTier).toBe(true)
      expect(d.reason.startsWith('[URGENT — WORST TIER] ')).toBe(true)
    }
  })
  it('never writes model-authored prose into the reason', () => {
    const d = decide(answers({ hate_speech: 0.98 }))
    if (d.action === 'screen') expect(d.reason).toMatch(/^Automated screening: hate_speech 0\.98$/)
  })
})
