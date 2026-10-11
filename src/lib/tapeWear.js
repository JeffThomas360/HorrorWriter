/**
 * How worn a Library tape looks. Everything here is cosmetic, but it is never
 * random per visit: each story's look is seeded by its id, so the same tape
 * always has the same tilt, scuffs and sticker angle. How much wear it shows
 * comes from real data only: age and critique count. A well-critiqued old
 * story looks like a much-rented tape; nothing implies activity that isn't there.
 */

/** 32-bit FNV-1a hash of a string. */
export function hashString(str) {
  let h = 0x811c9dc5
  for (const ch of String(str ?? '')) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
export function seededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 86400000

/**
 * Wear level 0–4 from real data. Age adds a step at roughly 1 week, 3 weeks,
 * 2 months and 4 months; every two critiques add one more. Capped at 4.
 */
export function wearLevel({ created_at, comments_count } = {}, now = Date.now()) {
  const created = created_at ? new Date(created_at).getTime() : now
  const ageDays = Math.max(0, (now - created) / DAY)
  const fromAge = Math.floor(Math.log2(ageDays / 7 + 1))
  const fromCritiques = Math.floor((Number(comments_count) || 0) / 2)
  return Math.min(4, Math.max(0, fromAge + fromCritiques))
}

/** Minutes to read at ~230 words a minute; never less than 1. Null without text. */
export function readMinutes(content) {
  const words = String(content ?? '').trim().split(/\s+/).filter(Boolean).length
  if (!words) return null
  return Math.max(1, Math.round(words / 230))
}

const range = (rand, min, max) => min + rand() * (max - min)

/** The full per-story look. Pure: same story + same day gives the same look. */
export function tapeLook(story, now = Date.now()) {
  const rand = seededRandom(hashString(story?.id))
  const wear = wearLevel(story, now)
  const scuffs = Array.from({ length: 2 + wear }, () => ({
    x: Math.round(range(rand, 6, 94)),
    y: Math.round(range(rand, 8, 92)),
    size: Math.round(range(rand, 1, 3 + wear))
  }))
  return {
    wear,
    tilt: Number(range(rand, -1.6, 1.6).toFixed(2)),
    stickerTilt: Math.round(range(rand, -18, 18)),
    residue: {
      top: Math.round(range(rand, 30, 70)),
      left: rand() < 0.5,
      rotate: Math.round(range(rand, -14, 14)),
      show: rand() < 0.35 + wear * 0.15
    },
    scuffs,
    fadeFromLeft: rand() < 0.5,
    cracked: wear >= 3 && rand() < 0.7
  }
}
