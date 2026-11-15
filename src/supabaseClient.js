import { createClient } from '@supabase/supabase-js'
import { makeLoggingFetch } from './lib/loggingFetch'
import { isPlaywrightTest } from './lib/testMode'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Reports failed requests. The dynamic import breaks the supabaseClient <->
// errorReporter cycle (the reporter itself uses this client).
export const loggedFetch = makeLoggingFetch((e) =>
  import('./lib/errorReporter').then((m) => m.reportSiteEvent(e)))

// Only create the client if the keys are defined. E2E mocks its requests and
// must not gain an unmocked logging call, so it keeps the plain fetch.
export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, isPlaywrightTest() ? undefined : { global: { fetch: loggedFetch } })
    : null
