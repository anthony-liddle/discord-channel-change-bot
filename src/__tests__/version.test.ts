import { describe, it, expect } from 'vitest';
import { DEPLOY_MARKER, UNKNOWN_MARKER, readDeployMarker } from '../version';

/**
 * The marker is the only way to see what is actually running, and it has now
 * misled us three times as a hand maintained constant. The failure mode is
 * always the same: someone forgets to bump it, so a working deploy looks dead
 * or a dead one looks fine.
 *
 * It is derived from the git SHA at build time instead. The rule that matters
 * most is the last one here: when the mechanism fails it says unknown rather
 * than something stale or plausible. A marker that can lie is worse than no
 * marker at all.
 */

describe('readDeployMarker accepts a real commit SHA', () => {
  it('shortens a full SHA to something readable off a phone', () => {
    expect(readDeployMarker('077ab0d1f2e3c4b5a6978899aabbccddeeff0011')).toBe(
      '077ab0d',
    );
  });

  it('accepts an already short SHA', () => {
    expect(readDeployMarker('077ab0d')).toBe('077ab0d');
  });

  it('lowercases, so the same commit always reads the same', () => {
    expect(readDeployMarker('077AB0D1F2E3C4B5A6978899AABBCCDDEEFF0011')).toBe(
      '077ab0d',
    );
  });

  it('ignores surrounding whitespace from the build arg', () => {
    expect(readDeployMarker('  077ab0d  ')).toBe('077ab0d');
  });

  it('contains no whitespace, so it survives being read off a phone screen', () => {
    expect(readDeployMarker('077ab0d')).not.toMatch(/\s/);
  });
});

describe('readDeployMarker says unknown rather than lying', () => {
  // The build arg was never passed: an image built without --build-arg.
  it('reports unknown when the variable is missing', () => {
    expect(readDeployMarker(undefined)).toBe(UNKNOWN_MARKER);
  });

  it('reports unknown for an empty value', () => {
    expect(readDeployMarker('')).toBe(UNKNOWN_MARKER);
  });

  it('reports unknown for whitespace only', () => {
    expect(readDeployMarker('   ')).toBe(UNKNOWN_MARKER);
  });

  // The Dockerfile default, if nothing overrides it.
  it('reports unknown for the literal word unknown', () => {
    expect(readDeployMarker('unknown')).toBe(UNKNOWN_MARKER);
  });

  /**
   * The whole point. The old hand maintained value looks like a version and is
   * exactly the kind of plausible string that cost us three false diagnoses.
   * It must not survive as a marker.
   */
  it('reports unknown for the old hand maintained date marker', () => {
    expect(readDeployMarker('2026-09-01.1')).toBe(UNKNOWN_MARKER);
  });

  it('reports unknown for a branch name', () => {
    expect(readDeployMarker('main')).toBe(UNKNOWN_MARKER);
  });

  it('reports unknown for a dirty tree marker', () => {
    expect(readDeployMarker('dirty')).toBe(UNKNOWN_MARKER);
  });

  it('reports unknown for a SHA too short to identify a commit', () => {
    expect(readDeployMarker('077ab')).toBe(UNKNOWN_MARKER);
  });

  it('reports unknown for something longer than a SHA', () => {
    expect(readDeployMarker('0'.repeat(41))).toBe(UNKNOWN_MARKER);
  });

  it('reports unknown for non hex characters', () => {
    expect(readDeployMarker('zzzzzzz')).toBe(UNKNOWN_MARKER);
  });
});

// A marker is a diagnostic. It must never be the reason there is nothing to
// diagnose.
describe('readDeployMarker never throws', () => {
  for (const value of [
    undefined,
    null,
    42,
    {},
    [],
    true,
    Symbol('s'),
    () => 'x',
  ]) {
    it(`survives ${String(typeof value)} and returns unknown`, () => {
      expect(() => readDeployMarker(value as unknown as string)).not.toThrow();
      expect(readDeployMarker(value as unknown as string)).toBe(UNKNOWN_MARKER);
    });
  }
});

describe('DEPLOY_MARKER', () => {
  it('is a string, whatever the environment holds', () => {
    expect(typeof DEPLOY_MARKER).toBe('string');
  });

  it('is never empty, so the footer always has something to show', () => {
    expect(DEPLOY_MARKER.length).toBeGreaterThan(0);
  });

  it('is either a short SHA or the unknown marker, never anything else', () => {
    expect(DEPLOY_MARKER).toMatch(
      new RegExp(`^([0-9a-f]{7}|${UNKNOWN_MARKER})$`),
    );
  });

  it('is no longer a hand maintained date, which is what kept misleading us', () => {
    expect(DEPLOY_MARKER).not.toMatch(/^\d{4}-\d{2}-\d{2}\./);
  });
});
