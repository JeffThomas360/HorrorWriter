// Minimal TypeSafe System One client. No Deno or npm imports, so vitest can test it.
// Docs: https://docs.typesafe.ai/api.md — POST /v1/systemone, Bearer key.
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const MODEL = 'jev-latest'
const ATTEMPTS = 3
const RETRYABLE = new Set([429, 500, 502, 503, 504, 529])

type JudgeArgs = {
  apiKey: string
  state: unknown
  questions: Record<string, unknown>
  fetchFn?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Ask the questions about `state`. Retries overload and network errors with backoff, then throws. */
export async function judge({ apiKey, state, questions, fetchFn = fetch, sleep = wait }: JudgeArgs): Promise<unknown> {
  if (!apiKey) throw new Error('TypeSafe API key is not set')
  let lastError: Error = new Error('TypeSafe call failed')
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(250 * 2 ** (attempt - 1))
    try {
      const res = await fetchFn(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, model: MODEL, questions }),
      })
      if (res.ok) return await res.json()
      lastError = new Error(`TypeSafe responded ${res.status}`)
      if (!RETRYABLE.has(res.status)) throw lastError
    } catch (err) {
      if (err === lastError) throw err // a non-retryable status
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError
}
