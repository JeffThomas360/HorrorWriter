// Canonical page URLs. Every page is served at its trailing-slash URL; linking
// to the slash-less form costs a 307 on each click and each sitemap fetch.
export const SITE = 'https://horrorwriter.org'

const seg = (s) => encodeURIComponent(String(s))

export const storyPath = (id) => `/library/read/${seg(id)}/`
export const threadPath = (id) => `/forum/thread/${seg(id)}/`
export const seriesPath = (id) => `/library/series/${seg(id)}/`
export const profilePath = (handle) => `/u/${seg(handle)}/`

export const absoluteUrl = (path) => `${SITE}${path}`
