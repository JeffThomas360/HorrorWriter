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
