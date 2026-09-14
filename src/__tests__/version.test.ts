import { describe, it, expect } from 'vitest';
import {
  DEPLOY_LABEL,
  DEPLOY_MARKER,
  UNKNOWN_MARKER,
  buildDeployLabel,
  readDeployDate,
  readDeployMarker,
} from '../version';

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

// ─── the build date ───────────────────────────────────────────────────────────

/**
 * The SHA says exactly what is running; the date says how fresh at a glance,
 * which is the one thing the old sortable constant did better.
 *
 * It is baked in beside the SHA rather than computed at runtime. Computing it
 * at runtime would show today's date for an image built weeks ago, which is the
 * marker lying again in a new way.
 */
describe('readDeployDate accepts a real commit date', () => {
  it('accepts an ISO date', () => {
    expect(readDeployDate('2026-09-14')).toBe('2026-09-14');
  });

  it('ignores surrounding whitespace from the build arg', () => {
    expect(readDeployDate('  2026-09-14  ')).toBe('2026-09-14');
  });

  it('sorts lexicographically, which is what made the old constant readable', () => {
    expect(['2026-09-14', '2026-01-01', '2026-12-31'].sort()[0]).toBe(
      '2026-01-01',
    );
  });
});

describe('readDeployDate says unknown rather than lying', () => {
  for (const [label, value] of [
    ['a missing variable', undefined],
    ['an empty value', ''],
    ['whitespace only', '   '],
    ['the Dockerfile default', 'unknown'],
    ['a dirty tree marker', 'dirty'],
    ['an unpadded month', '2026-9-14'],
    ['a month that does not exist', '2026-13-01'],
    ['a day that does not exist', '2026-02-30'],
    ['a day-first date', '14-09-2026'],
    ['a full timestamp', '2026-09-14T12:00:00Z'],
    ['a SHA in the date slot', 'cd0a649'],
    ['a year on its own', '2026'],
  ] as [string, unknown][]) {
    it(`reports unknown for ${label}`, () => {
      expect(readDeployDate(value as string)).toBe(UNKNOWN_MARKER);
    });
  }
});

describe('readDeployDate never throws', () => {
  for (const value of [undefined, null, 42, {}, [], true, Symbol('s')]) {
    it(`survives ${String(typeof value)} and returns unknown`, () => {
      expect(() => readDeployDate(value as unknown as string)).not.toThrow();
      expect(readDeployDate(value as unknown as string)).toBe(UNKNOWN_MARKER);
    });
  }
});

/**
 * What the footer actually prints.
 *
 * The SHA is the identity and the date is the gloss, so a known date without a
 * known SHA still reads as unknown. A bare date in that footer is precisely the
 * shape that misled three times, and it would look like a complete answer while
 * hiding that nothing identifies the build.
 */
describe('buildDeployLabel', () => {
  it('shows the date then the SHA when both arrived', () => {
    expect(buildDeployLabel('cd0a649', '2026-09-14')).toBe(
      '2026-09-14 cd0a649',
    );
  });

  it('shows the SHA alone when the date did not arrive', () => {
    expect(buildDeployLabel('cd0a649', UNKNOWN_MARKER)).toBe('cd0a649');
  });

  it('reports unknown when the SHA did not arrive, even with a date', () => {
    expect(buildDeployLabel(UNKNOWN_MARKER, '2026-09-14')).toBe(UNKNOWN_MARKER);
  });

  it('reports unknown when neither arrived', () => {
    expect(buildDeployLabel(UNKNOWN_MARKER, UNKNOWN_MARKER)).toBe(
      UNKNOWN_MARKER,
    );
  });

  it('never contains a newline, so the footer stays one line', () => {
    expect(buildDeployLabel('cd0a649', '2026-09-14')).not.toMatch(/\n/);
  });
});

describe('DEPLOY_LABEL', () => {
  it('is a non-empty string, whatever the environment holds', () => {
    expect(typeof DEPLOY_LABEL).toBe('string');
    expect(DEPLOY_LABEL.length).toBeGreaterThan(0);
  });

  it('is a date and SHA, a bare SHA, or unknown, and nothing else', () => {
    expect(DEPLOY_LABEL).toMatch(
      new RegExp(
        `^(\\d{4}-\\d{2}-\\d{2} [0-9a-f]{7}|[0-9a-f]{7}|${UNKNOWN_MARKER})$`,
      ),
    );
  });
});
