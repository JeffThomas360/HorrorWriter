import { describe, it, expect } from 'vitest';

// Throwaway file to verify the ci-test-gate branch ruleset actually blocks
// a merge on a failing check. Delete this file/branch once confirmed —
// see work/ci-test-gate.md.
describe('ci gate verification', () => {
    it('deliberately fails', () => {
          expect(true).toBe(false);
    });
});
