import { test, expect, describe } from 'vitest'
import { isMod, modCan, isPermanentBan } from './moderation'

describe('isPermanentBan', () => {
  test('the date mod_apply_sanction writes for a permanent ban counts', () => {
    expect(isPermanentBan('2099-12-31T23:59:59Z')).toBe(true)
    // PostgREST returns it with an offset, not a Z.
    expect(isPermanentBan('2099-12-31T23:59:59+00:00')).toBe(true)
  })

  test('a suspension with an ordinary end date does not', () => {
    expect(isPermanentBan('2098-12-31T23:59:59Z')).toBe(false)
    expect(isPermanentBan('2026-11-13T00:00:00Z')).toBe(false)
  })

  test('no sanction at all does not', () => {
    expect(isPermanentBan(null)).toBe(false)
    expect(isPermanentBan(undefined)).toBe(false)
  })
})

const keeper    = { mod_role: 'keeper',    mod_scope: 'all' }
const warden    = { mod_role: 'warden',    mod_scope: 'all' }
const modForum  = { mod_role: 'moderator', mod_scope: 'forum' }
const sentLib   = { mod_role: 'sentinel',  mod_scope: 'library' }
const normal    = { mod_role: null,        mod_scope: 'all' }

describe('isMod', () => {
  test('true only when a role is set', () => {
    expect(isMod(keeper)).toBe(true)
    expect(isMod(normal)).toBe(false)
    expect(isMod(null)).toBe(false)
    expect(isMod(undefined)).toBe(false)
  })
})

describe('modCan', () => {
  test('normal user can do nothing', () => {
    expect(modCan(normal, 'hide', 'forum')).toBe(false)
    expect(modCan(normal, 'view_hidden', 'all')).toBe(false)
  })
  test('keeper can do everything', () => {
    expect(modCan(keeper, 'assign_role', 'all')).toBe(true)
    expect(modCan(keeper, 'configure', 'all')).toBe(true)
    expect(modCan(keeper, 'ban', 'library')).toBe(true)
  })
  test('only keeper assigns roles / configures', () => {
    expect(modCan(warden, 'assign_role', 'all')).toBe(false)
    expect(modCan(warden, 'configure', 'all')).toBe(false)
  })
  test('warden can ban/shadowban/read_audit but not assign', () => {
    expect(modCan(warden, 'ban', 'all')).toBe(true)
    expect(modCan(warden, 'shadowban', 'all')).toBe(true)
    expect(modCan(warden, 'read_audit', 'all')).toBe(true)
  })
  test('moderator can screen+hide in scope, not ban', () => {
    expect(modCan(modForum, 'screen', 'forum')).toBe(true)
    expect(modCan(modForum, 'hide', 'forum')).toBe(true)
    expect(modCan(modForum, 'ban', 'forum')).toBe(false)
  })
  test('scoped role blocked outside its area', () => {
    expect(modCan(modForum, 'hide', 'library')).toBe(false)
    expect(modCan(sentLib, 'hide', 'forum')).toBe(false)
    expect(modCan(sentLib, 'hide', 'library')).toBe(true)
  })
  test('sentinel cannot screen', () => {
    expect(modCan(sentLib, 'screen', 'library')).toBe(false)
  })
  test("area 'all' request satisfied by any scope", () => {
    expect(modCan(modForum, 'view_hidden', 'all')).toBe(true)
  })
})
