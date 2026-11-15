import { test, expect } from 'vitest'
import { requestAction, shouldIgnore } from './requestAction'

const B = 'https://x.supabase.co'
test.each([
  ['POST',   `${B}/rest/v1/rpc/create_thread_with_post`,         'rpc:create_thread_with_post'],
  ['GET',    `${B}/rest/v1/books?select=*&id=eq.123`,            'books:select'],
  ['HEAD',   `${B}/rest/v1/books`,                               'books:select'],
  ['POST',   `${B}/rest/v1/book_comments`,                       'book_comments:insert'],
  ['PATCH',  `${B}/rest/v1/books?id=eq.123`,                     'books:update'],
  ['DELETE', `${B}/rest/v1/user_follows?follower_id=eq.1`,       'user_follows:delete'],
  ['POST',   `${B}/auth/v1/otp`,                                 'auth:otp'],
  ['POST',   `${B}/auth/v1/token?grant_type=refresh_token`,      'auth:token'],
  ['POST',   `${B}/functions/v1/open-ticket`,                    'fn:open-ticket'],
  ['POST',   `${B}/storage/v1/object/avatars/a.png`,             'storage:insert'],
  ['GET',    'https://example.com/anything',                     null],
  ['GET',    'not a url',                                        null],
])('%s %s → %s', (method, url, expected) => {
  expect(requestAction(method, url)).toBe(expected)
})

test('the action never carries a query value', () => {
  expect(requestAction('GET', `${B}/rest/v1/profiles?handle=eq.secret`)).not.toContain('secret')
})

test.each([
  [{ action: 'rpc:log_site_event', status: 500 }, true],   // logging its own failure would loop
  [{ action: 'rpc:log_client_error', status: 0 }, true],
  [{ action: 'books:select', status: 406, code: 'PGRST116' }, true], // .single() found no row
  [{ action: 'books:select', status: 0, errorName: 'AbortError' }, true], // member navigated away
  [{ action: 'auth:token', status: 400 }, true],            // expired session refresh
  [{ action: 'books:update', status: 409, code: '23505' }, false],
  [{ action: 'auth:otp', status: 429 }, false],
  [{ action: null, status: 500 }, false],
])('shouldIgnore(%o) → %s', (event, expected) => {
  expect(shouldIgnore(event)).toBe(expected)
})
