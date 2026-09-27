// Thin indirection around the two dynamically-imported seal modules
// (seal.js pulls in the ~25 KB gzipped EFF wordlist, sealCollect.js is
// negligible). Kept in its own module — rather than inlining the
// `import()` calls in DeleteAccount.jsx — so DeleteAccount's tests can
// mock a failed chunk fetch and control resolution timing per test via
// the usual `vi.fn()` mock APIs (`mockResolvedValue`,
// `mockRejectedValueOnce`, ...). A bare `import()` call inline in a
// component isn't independently interceptable that way.
export function loadSealModules() {
  return Promise.all([import('./seal'), import('./sealCollect')]).then(([seal, sealCollect]) => ({
    ...seal,
    ...sealCollect,
  }))
}
