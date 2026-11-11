import { test, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// create_thread_with_post exists twice in the database: (title, category, content)
// and (title, category, content, prompt_id default null). A call that names only
// the first three matches both, and PostgREST answers 300 PGRST203 "Could not
// choose the best candidate function". That broke posting a thread for three
// weeks. Every call must name p_prompt_id so only one function matches.

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(jsx?|astro)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

test('every create_thread_with_post call names p_prompt_id', () => {
  const calls = []
  for (const file of sourceFiles('src')) {
    const text = readFileSync(file, 'utf8')
    const pattern = /rpc\(\s*'create_thread_with_post'\s*,\s*\{([\s\S]*?)\}\s*\)/g
    for (const match of text.matchAll(pattern)) calls.push({ file, args: match[1] })
  }
  expect(calls.length).toBeGreaterThanOrEqual(2)
  for (const call of calls) {
    expect(call.args, `${call.file} must pass p_prompt_id`).toMatch(/\bp_prompt_id\b/)
  }
})
