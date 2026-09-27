import '@testing-library/jest-dom/vitest';

// jsdom's CompressionStream/DecompressionStream/crypto.subtle are missing on
// older Node, and jsdom's Blob has no .stream() — Node's does. Node 24+
// provides the Streams/WebCrypto globals already; this only fills real gaps.
import { CompressionStream, DecompressionStream } from 'node:stream/web';
import { webcrypto } from 'node:crypto';
import { Blob } from 'node:buffer';
globalThis.CompressionStream ??= CompressionStream;
globalThis.DecompressionStream ??= DecompressionStream;
globalThis.crypto ??= webcrypto;
globalThis.Blob = Blob;
