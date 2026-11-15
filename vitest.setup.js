import '@testing-library/jest-dom/vitest';

// Defensive polyfills for older Node/jsdom combinations that lack
// CompressionStream/DecompressionStream or a full crypto.subtle. Node 24+
// (what this repo runs) already provides all three globally, so these are
// no-ops here, but keep the environment from silently breaking if that
// changes.
import { CompressionStream, DecompressionStream } from 'node:stream/web';
import { webcrypto } from 'node:crypto';
globalThis.CompressionStream ??= CompressionStream;
globalThis.DecompressionStream ??= DecompressionStream;
if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;

// Node 25+ defines its own global `localStorage` / `sessionStorage`, which are
// undefined unless Node is started with --localstorage-file. Because the names
// already exist on the global object, Vitest does not replace them with jsdom's,
// and every test that touches storage fails with "Cannot read properties of
// undefined". Point both names back at the jsdom window's storage. On Node 22
// (what CI and .nvmrc use) the globals are already jsdom's and this does nothing.
for (const name of ['localStorage', 'sessionStorage']) {
  let current;
  try { current = globalThis[name]; } catch { current = undefined; }
  const fromJsdom = globalThis.jsdom?.window?.[name];
  if (!current && fromJsdom) {
    Object.defineProperty(globalThis, name, { value: fromJsdom, configurable: true, writable: true });
  }
}
