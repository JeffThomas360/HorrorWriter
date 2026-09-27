// Pure HMAC helper. No Deno or npm imports, so vitest can test it.
export async function emailKey(email: string, secret: string): Promise<string> {
  if (!secret) throw new Error('emailKey: secret is required')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(email.trim().toLowerCase())))
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
}
