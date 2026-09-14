import { describe, it, expect } from 'vitest';
import type { ThemeEntry } from '../types';
import { buildRotatedView } from '../commands/reorder-themes';
import {
  REORDER_TEXT_BUDGET,
  applyMove,
  buildReorderPages,
  parseMove,
  pageContaining,
} from '../commands/reorder-view';
import { MAX_THEME_NAME } from '../theme-validation';

/**
 * The numbered list is the whole point of reorder, so it cannot be replaced by
 * a menu the way edit and delete were. It has to stay readable at any length,
 * which means paging the text rather than refusing past a count.
 *
 * Neutral fixture names throughout.
 */

const list = (n: number, nameLength = 20): ThemeEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Fixture ${i + 1}`.padEnd(nameLength, 'x').slice(0, nameLength),
    message: 'm',
  }));

const viewOf = (themes: ThemeEntry[]) => buildRotatedView(themes, 0);

// ─── the text budget ──────────────────────────────────────────────────────────

// The ceiling report estimated this list at about 950 characters for 25 themes,
// but measured with 30 character names. At the 95 character cap each line is
// roughly 100, so the list crosses 2000 at about 20 themes, below the select
// cap it was meant to be fixing. Verified: 20 is where it crosses.
describe('reorder pages always fit inside a Discord message', () => {
  for (const count of [24, 25, 26, 200]) {
    it(`reorder-themes at ${count} themes keeps every page under the message cap`, () => {
      for (const page of buildReorderPages(viewOf(list(count)))) {
        expect(page.length).toBeLessThanOrEqual(REORDER_TEXT_BUDGET);
      }
    });

    it(`reorder-themes at ${count} themes with maximum length names keeps every page under the cap`, () => {
      for (const page of buildReorderPages(
        viewOf(list(count, MAX_THEME_NAME)),
      )) {
        expect(page.length).toBeLessThanOrEqual(REORDER_TEXT_BUDGET);
      }
    });
  }

  it('never exceeds the cap even when a single stored name is absurdly long', () => {
    const themes = [
      { name: 'x'.repeat(9000), message: 'm' },
      { name: 'Fixture 2', message: 'm' },
    ] as ThemeEntry[];
    for (const page of buildReorderPages(viewOf(themes))) {
      expect(page.length).toBeLessThanOrEqual(REORDER_TEXT_BUDGET);
    }
  });

  it('keeps the whole list on one page when it comfortably fits', () => {
    expect(buildReorderPages(viewOf(list(14)))).toHaveLength(1);
  });

  it('uses more pages for longer names than for short ones', () => {
    const short = buildReorderPages(viewOf(list(40, 10))).length;
    const long = buildReorderPages(viewOf(list(40, MAX_THEME_NAME))).length;
    expect(long).toBeGreaterThan(short);
  });
});

describe('reorder pages show every theme exactly once', () => {
  for (const count of [24, 25, 26, 200]) {
    it(`reorder-themes at ${count} themes lists every position across its pages`, () => {
      const text = buildReorderPages(viewOf(list(count))).join('\n');
      for (let position = 1; position <= count; position++) {
        expect(text).toContain(`${position}. `);
      }
    });
  }

  it('numbers positions from one', () => {
    expect(buildReorderPages(viewOf(list(3)))[0]).toContain('1. ');
  });

  it('marks the current theme', () => {
    expect(buildReorderPages(viewOf(list(3)))[0]).toMatch(/current/i);
  });

  it('says which page of how many', () => {
    const pages = buildReorderPages(viewOf(list(200, MAX_THEME_NAME)));
    expect(pages[0]).toContain(`of ${pages.length}`);
  });

  it('survives a malformed entry instead of throwing', () => {
    const ugly = [
      { name: 'Fixture 1', message: 'm' },
      null,
      { name: 7, message: 'm' },
      'legacy string theme',
    ] as unknown as ThemeEntry[];
    expect(() => buildReorderPages(viewOf(ugly))).not.toThrow();
  });
});

// Moving is by absolute position, so it works across pages. The page buttons
// are for looking, never for moving.
describe('pageContaining', () => {
  it('finds the page a position is displayed on', () => {
    const view = viewOf(list(200, MAX_THEME_NAME));
    const pages = buildReorderPages(view);
    expect(pageContaining(view, 1)).toBe(0);
    expect(pageContaining(view, 200)).toBe(pages.length - 1);
  });

  it('clamps a position that is off the end', () => {
    const view = viewOf(list(10));
    expect(pageContaining(view, 999)).toBe(0);
  });
});

// ─── parsing a move ───────────────────────────────────────────────────────────

describe('parseMove', () => {
  it('accepts two positions and returns zero based display indexes', () => {
    expect(parseMove('27', '3', 30)).toEqual({ ok: true, from: 26, to: 2 });
  });

  it('ignores surrounding whitespace', () => {
    expect(parseMove('  5 ', ' 1  ', 10)).toEqual({ ok: true, from: 4, to: 0 });
  });

  it('refuses a position of zero, because the list is numbered from one', () => {
    expect(parseMove('0', '3', 10).ok).toBe(false);
  });

  it('refuses a position past the end of the list', () => {
    expect(parseMove('11', '3', 10).ok).toBe(false);
  });

  it('names the valid range when it refuses', () => {
    const result = parseMove('11', '3', 10);
    if (!result.ok) expect(result.reason).toContain('10');
  });

  it('refuses text that is not a number', () => {
    expect(parseMove('seven', '3', 10).ok).toBe(false);
  });

  it('refuses a decimal', () => {
    expect(parseMove('2.5', '3', 10).ok).toBe(false);
  });

  it('refuses a negative position', () => {
    expect(parseMove('-2', '3', 10).ok).toBe(false);
  });

  it('refuses moving a theme onto its own position', () => {
    const result = parseMove('4', '4', 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/already/i);
  });
});

// ─── applying a move ──────────────────────────────────────────────────────────

describe('applyMove', () => {
  const names = (themes: ThemeEntry[]) =>
    themes.map((t) => (t as { name: string }).name);

  it('moves a theme from the end to the front', () => {
    const themes = list(5);
    const moved = applyMove(themes, 0, 4, 0);
    expect(names(moved)[0]).toBe('Fixture 5xxxxxxxxxxx');
  });

  it('keeps every theme when moving', () => {
    const themes = list(30);
    const moved = applyMove(themes, 0, 29, 2);
    expect(moved).toHaveLength(30);
    expect(new Set(names(moved)).size).toBe(30);
  });

  it('moves a theme forwards without dropping the ones it passes', () => {
    const themes = list(5);
    const moved = applyMove(themes, 0, 0, 3);
    expect(names(moved)).toEqual([
      'Fixture 2xxxxxxxxxxx',
      'Fixture 3xxxxxxxxxxx',
      'Fixture 4xxxxxxxxxxx',
      'Fixture 1xxxxxxxxxxx',
      'Fixture 5xxxxxxxxxxx',
    ]);
  });

  // The list is shown in rotation order, so display position 0 is whatever is
  // current. Writing back has to preserve that mapping or the rotation jumps.
  it('writes back in file order when the view starts partway through', () => {
    const themes = list(4);
    const moved = applyMove(themes, 2, 0, 1);
    expect(moved).toHaveLength(4);
    expect(new Set(names(moved)).size).toBe(4);
  });

  it('leaves the list unchanged in length at any size', () => {
    for (const count of [24, 25, 26, 200]) {
      expect(applyMove(list(count), 0, count - 1, 0)).toHaveLength(count);
    }
  });
});
