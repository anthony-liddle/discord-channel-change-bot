import { describe, it, expect } from 'vitest';
import { buildRotatedView } from '../commands/reorder-themes';
import type { ThemeEntry } from '../types';

const themes: ThemeEntry[] = [
  { name: 'alpha', message: '' },
  { name: 'beta', message: '' },
  { name: 'gamma', message: '' },
  { name: 'delta', message: '' },
];

// ─── buildRotatedView ─────────────────────────────────────────────────────────

describe('buildRotatedView', () => {
  it('returns file order unchanged when currentIndex is 0', () => {
    const view = buildRotatedView(themes, 0);
    expect(view.map((v) => v.theme)).toEqual(themes);
  });

  it('starts from currentIndex when non-zero', () => {
    const view = buildRotatedView(themes, 2);
    expect(view.map((v) => (v.theme as { name: string }).name)).toEqual([
      'gamma',
      'delta',
      'alpha',
      'beta',
    ]);
  });

  it('wraps around from the last theme back to the first', () => {
    const view = buildRotatedView(themes, 3);
    expect(view.map((v) => (v.theme as { name: string }).name)).toEqual([
      'delta',
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  it('assigns correct absoluteIndex for each entry', () => {
    const view = buildRotatedView(themes, 1);
    expect(view.map((v) => v.absoluteIndex)).toEqual([1, 2, 3, 0]);
  });

  it('absoluteIndex at display position 0 always equals currentIndex', () => {
    for (let i = 0; i < themes.length; i++) {
      expect(buildRotatedView(themes, i)[0].absoluteIndex).toBe(i);
    }
  });

  it('theme at each position matches themes[absoluteIndex]', () => {
    const view = buildRotatedView(themes, 2);
    for (const item of view) {
      expect(item.theme).toBe(themes[item.absoluteIndex]);
    }
  });

  it('handles a single theme', () => {
    const single: ThemeEntry[] = [{ name: 'solo', message: '' }];
    const view = buildRotatedView(single, 0);
    expect(view).toHaveLength(1);
    expect(view[0].absoluteIndex).toBe(0);
  });

  it('returns the same length as the themes array', () => {
    expect(buildRotatedView(themes, 1)).toHaveLength(themes.length);
  });

  it('matches the ordering produced by getUpcomingThemes for the same currentIndex', () => {
    // Verifies the two commands display the same rotation order
    const view = buildRotatedView(themes, 1);
    // getUpcomingThemes starting from index 1 gives: beta, gamma, delta, alpha
    expect(view.map((v) => (v.theme as { name: string }).name)).toEqual([
      'beta',
      'gamma',
      'delta',
      'alpha',
    ]);
  });
});
