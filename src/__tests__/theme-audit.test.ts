import { describe, it, expect } from 'vitest';
import type { ThemeEntry } from '../types';
import {
  MAX_THEME_MESSAGE,
  MAX_THEME_NAME,
  auditThemes,
  formatThemeProblems,
} from '../theme-validation';

/**
 * addTheme and updateTheme validate what they are handed, but themes.json is
 * hand edited on the Fly volume and that path calls neither. Auditing at reload
 * is what catches a bad entry at the moment it is pasted in, rather than on the
 * Monday the rotation reaches it and wedges.
 */

const ok = (name: string) => ({ name, message: 'A message.' });

describe('auditThemes on a clean list', () => {
  it('reports nothing for a list of valid themes', () => {
    expect(auditThemes([ok('Weekly theme toys'), ok('Café Night')])).toEqual(
      [],
    );
  });

  it('reports nothing for an empty list', () => {
    expect(auditThemes([])).toEqual([]);
  });

  it('accepts a legacy string entry with no message', () => {
    expect(auditThemes(['Weekly theme toys'] as ThemeEntry[])).toEqual([]);
  });

  it('accepts an entry with no message at all', () => {
    expect(auditThemes([{ name: 'Weekly theme toys' }])).toEqual([]);
  });
});

describe('auditThemes finds the entry that would wedge the rotation', () => {
  it('reports an emoji-only name', () => {
    const problems = auditThemes([
      ok('Fine'),
      { name: '🔥🔥🔥', message: 'm' },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0].problem).toMatch(/channel name/i);
  });

  it('reports the position so the admin can find it in the file', () => {
    const problems = auditThemes([
      ok('Fine'),
      { name: '🔥🔥🔥', message: 'm' },
    ]);
    expect(problems[0].position).toBe(2);
  });

  it('reports every bad entry, not just the first', () => {
    const problems = auditThemes([
      { name: '!!!', message: 'm' },
      ok('Fine'),
      { name: '日本語', message: 'm' },
    ]);
    expect(problems.map((p) => p.position)).toEqual([1, 3]);
  });
});

describe('auditThemes finds the shapes a hand edit produces', () => {
  it('reports a non-string name', () => {
    expect(
      auditThemes([{ name: 7 }] as unknown as ThemeEntry[])[0].problem,
    ).toMatch(/text/i);
  });

  it('reports a null entry', () => {
    expect(auditThemes([null] as unknown as ThemeEntry[])).toHaveLength(1);
  });

  it('reports an empty name', () => {
    expect(auditThemes([{ name: '', message: 'm' }])[0].problem).toMatch(
      /empty/i,
    );
  });

  it('reports an over-length name', () => {
    const problems = auditThemes([{ name: 'a'.repeat(MAX_THEME_NAME + 1) }]);
    expect(problems[0].problem).toMatch(
      new RegExp(`${MAX_THEME_NAME} characters`),
    );
  });

  it('reports an over-length message', () => {
    const problems = auditThemes([
      { name: 'Fine', message: 'a'.repeat(MAX_THEME_MESSAGE + 1) },
    ]);
    expect(problems[0].problem).toMatch(
      new RegExp(`${MAX_THEME_MESSAGE} characters`),
    );
  });

  it('reports a non-string message', () => {
    const problems = auditThemes([
      { name: 'Fine', message: 42 },
    ] as unknown as ThemeEntry[]);
    expect(problems[0].problem).toMatch(/text/i);
  });
});

// Two entries sharing a name is what broke edit-theme on 2026-08-30, and a
// batch paste is exactly how it happens again.
describe('auditThemes finds duplicates', () => {
  it('reports the second of two identical names', () => {
    const problems = auditThemes([
      ok('Thicc and Thirsty'),
      ok('Thicc and Thirsty'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0].position).toBe(2);
  });

  it('points at the position it collides with', () => {
    const problems = auditThemes([
      ok('Thicc and Thirsty'),
      ok('Thicc and Thirsty'),
    ]);
    expect(problems[0].problem).toMatch(/1/);
  });

  it('reports names differing only by case as duplicates', () => {
    expect(auditThemes([ok('Toys'), ok('TOYS')])).toHaveLength(1);
  });

  it('reports names differing only by whitespace as duplicates', () => {
    expect(auditThemes([ok('Toys'), ok('  Toys  ')])).toHaveLength(1);
  });

  it('does not report a clean list as duplicated', () => {
    expect(auditThemes([ok('Toys'), ok('Senses'), ok('Bondage')])).toEqual([]);
  });
});

describe('formatThemeProblems', () => {
  it('returns an empty string when there is nothing wrong', () => {
    expect(formatThemeProblems([])).toBe('');
  });

  it('names the position and the problem', () => {
    const text = formatThemeProblems(auditThemes([{ name: '!!!' }]));
    expect(text).toContain('1');
    expect(text).toMatch(/channel name/i);
  });

  // The reply also carries the file attachments and the reload summary, so the
  // problem list cannot be allowed to blow the 2000 character message cap.
  it('stays well inside the message cap for a badly broken file', () => {
    const broken = Array.from({ length: 200 }, () => ({ name: '!!!' }));
    expect(formatThemeProblems(auditThemes(broken)).length).toBeLessThanOrEqual(
      1200,
    );
  });

  it('says how many it left out when it truncates', () => {
    const broken = Array.from({ length: 200 }, () => ({ name: '!!!' }));
    expect(formatThemeProblems(auditThemes(broken))).toMatch(/more/i);
  });
});
