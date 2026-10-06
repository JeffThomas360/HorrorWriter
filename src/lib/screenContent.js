/**
 * Ask the moderate-content function to screen a row the author just created.
 *
 * Callers that redirect afterwards MUST await this. A fire-and-forget call is
 * cancelled by `window.location.replace`, so the screen never runs (the thread
 * and story forms did exactly that). The wait is capped so a slow or failed
 * call never traps the writer on the page, and this never rejects.
 */
export async function screenContent(supabase, targetType, targetId, timeoutMs = 4000) {
  if (!supabase || !targetId) return
  let timer
  try {
    const call = Promise.resolve(
      supabase.functions.invoke('moderate-content', { body: { targetType, targetId } })
    ).catch(console.error)
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs) })
    await Promise.race([call, timeout])
  } catch (err) {
    console.error(err)
  } finally {
    clearTimeout(timer)
  }
}
