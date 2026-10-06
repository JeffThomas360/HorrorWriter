import { describe, it, expect } from 'vitest'
import {
  TASK_TYPES, typeInfo, describeTask, actionsFor, isSnoozed,
  sortTasks, visibleTasks, openCount, countsByType,
} from './keeperTasks'

const NOW = new Date('2026-10-10T12:00:00Z')
const task = (over = {}) => ({
  id: 't', type: 'manual', status: 'open', priority: 0, snoozed_until: null,
  created_at: '2026-10-01T00:00:00Z', payload: { title: 'Buy domain' }, ...over,
})

describe('registry', () => {
  it('knows the manual type: label, description, Done and Dismiss', () => {
    expect(TASK_TYPES.manual.label).toBe('To-do')
    expect(describeTask(task())).toBe('Buy domain')
    expect(actionsFor(task()).map((a) => a.id)).toEqual(['done', 'dismiss'])
  })
  it('shows an unknown type plainly, with no actions, and never throws', () => {
    const t = task({ type: 'from_the_future', payload: {} })
    expect(typeInfo('from_the_future').label).toBe('Unknown task')
    expect(describeTask(t)).toBe('from_the_future')
    expect(actionsFor(t)).toEqual([])
  })
  it('copes with a missing payload', () => {
    expect(describeTask(task({ payload: null }))).toBe('Untitled task')
  })
})

describe('isSnoozed', () => {
  it('is true only while snoozed_until is in the future', () => {
    expect(isSnoozed(task({ snoozed_until: '2026-10-11T00:00:00Z' }), NOW)).toBe(true)
    expect(isSnoozed(task({ snoozed_until: '2026-10-10T11:00:00Z' }), NOW)).toBe(false)
    expect(isSnoozed(task(), NOW)).toBe(false)
  })
})

describe('sortTasks', () => {
  it('puts high priority first, then oldest first, without mutating', () => {
    const a = task({ id: 'a', created_at: '2026-10-03T00:00:00Z' })
    const b = task({ id: 'b', created_at: '2026-10-01T00:00:00Z' })
    const c = task({ id: 'c', priority: 1, created_at: '2026-10-05T00:00:00Z' })
    const input = [a, b, c]
    expect(sortTasks(input).map((t) => t.id)).toEqual(['c', 'b', 'a'])
    expect(input.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('visibleTasks / counts', () => {
  const tasks = [
    task({ id: 'open' }),
    task({ id: 'snoozed', snoozed_until: '2026-10-12T00:00:00Z' }),
    task({ id: 'other', type: 'tag_review' }),
    task({ id: 'done', status: 'resolved' }),
  ]
  it('hides resolved and snoozed by default', () => {
    expect(visibleTasks(tasks, { now: NOW }).map((t) => t.id).sort()).toEqual(['open', 'other'])
  })
  it('can show snoozed ones, and filter by type', () => {
    expect(visibleTasks(tasks, { now: NOW, showSnoozed: true }).map((t) => t.id).sort()).toEqual(['open', 'other', 'snoozed'])
    expect(visibleTasks(tasks, { now: NOW, type: 'tag_review' }).map((t) => t.id)).toEqual(['other'])
  })
  it('counts only open, un-snoozed tasks', () => {
    expect(openCount(tasks, NOW)).toBe(2)
    expect(countsByType(tasks, NOW)).toEqual({ manual: 1, tag_review: 1 })
  })
})
