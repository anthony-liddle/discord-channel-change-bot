import { describe, it, expect } from 'vitest';
import type { ThemeEntry } from '../types';
import {
  MAX_AUTOCOMPLETE_CHOICES,
  buildThemeChoices,
  encodeThemeChoice,
  resolveThemeSelection,
} from '../commands/theme-autocomplete';

/**
 * Autocomplete's 25 is a window over an unbounded list, because the filtering
 * happens here before responding. 26 themes and 200 themes cost the same.
 *
 * Neutral fixture names throughout.
 */

const list = (n: number): ThemeEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Fixture theme ${i + 1}`,
    message: `Message ${i + 1}`,
  }));

const names = (choices: { name: string }[]) => choices.map((c) => c.name);

// ─── the window ───────────────────────────────────────────────────────────────

describe('buildThemeChoices never exceeds the Discord cap', () => {
  for (const count of [24, 25, 26, 200]) {
    it(`returns at most ${MAX_AUTOCOMPLETE_CHOICES} choices from ${count} themes`, () => {
      expect(buildThemeChoices(list(count), '').length).toBeLessThanOrEqual(
        MAX_AUTOCOMPLETE_CHOICES,
      );
    });

    it(`returns at most ${MAX_AUTOCOMPLETE_CHOICES} choices from ${count} themes for a broad query`, () => {
      expect(
        buildThemeChoices(list(count), 'fixture').length,
      ).toBeLessThanOrEqual(MAX_AUTOCOMPLETE_CHOICES);
    });
  }

  it('returns every theme when the list is smaller than the cap', () => {
    expect(buildThemeChoices(list(5), '')).toHaveLength(5);
  });

  it('keeps every choice name inside the 100 character Discord cap', () => {
    const long: ThemeEntry[] = Array.from({ length: 200 }, () => ({
      name: 'y'.repeat(95),
      message: 'm',
    }));
    for (const choice of buildThemeChoices(long, '')) {
      expect(choice.name.length).toBeLessThanOrEqual(100);
    }
  });

  it('keeps every choice value inside the 100 character Discord cap', () => {
    for (const choice of buildThemeChoices(list(200), '')) {
      expect(choice.value.length).toBeLessThanOrEqual(100);
    }
  });
});

// ─── filtering ────────────────────────────────────────────────────────────────

describe('buildThemeChoices filtering', () => {
  const themes: ThemeEntry[] = [
    { name: 'Monochrome', message: 'm' },
    { name: 'Macro', message: 'm' },
    { name: 'Golden Hour', message: 'm' },
    { name: 'Street', message: 'm' },
  ];

  it('returns everything for an empty query', () => {
    expect(buildThemeChoices(themes, '')).toHaveLength(4);
  });

  it('returns everything for a whitespace only query', () => {
    expect(buildThemeChoices(themes, '   ')).toHaveLength(4);
  });

  it('narrows to the matching theme', () => {
    expect(names(buildThemeChoices(themes, 'golden'))).toEqual([
      '3. Golden Hour',
    ]);
  });

  it('matches case insensitively', () => {
    expect(buildThemeChoices(themes, 'GOLDEN')).toHaveLength(1);
  });

  // Every live theme name starts with the same two words, so prefix matching
  // would narrow nothing. Substring is the only useful rule for this data.
  it('matches on a substring rather than only a prefix', () => {
    expect(names(buildThemeChoices(themes, 'hour'))).toEqual([
      '3. Golden Hour',
    ]);
  });

  // "ro" appears inside monochrome and macro but at the start of neither,
  // which is the case prefix matching would miss entirely.
  it('matches several themes when the substring is shared', () => {
    expect(names(buildThemeChoices(themes, 'ro'))).toEqual([
      '1. Monochrome',
      '2. Macro',
    ]);
  });

  it('returns nothing when no theme matches', () => {
    expect(buildThemeChoices(themes, 'zzzz')).toEqual([]);
  });

  // Typing the position is the fastest way to reach a theme you can already see
  // in the reorder list.
  it('matches on the position number', () => {
    expect(names(buildThemeChoices(themes, '3'))).toContain('3. Golden Hour');
  });

  it('survives a malformed entry instead of throwing', () => {
    const ugly = [
      { name: 'Monochrome', message: 'm' },
      null,
      { name: 7, message: 'm' },
      'legacy string theme',
    ] as unknown as ThemeEntry[];
    expect(() => buildThemeChoices(ugly, '')).not.toThrow();
    expect(buildThemeChoices(ugly, '')).toHaveLength(4);
  });
});

// ─── position survives ────────────────────────────────────────────────────────

// The numbered label is what made two themes called the same thing repairable
// in August. An autocomplete choice has only a name and a value, so the
// position has to be carried in the name explicitly.
describe('two themes with identical names stay distinguishable', () => {
  const twins: ThemeEntry[] = [
    { name: 'Repeated Name', message: 'first' },
    { name: 'Repeated Name', message: 'second' },
  ];

  it('shows a different choice name for each', () => {
    const [a, b] = buildThemeChoices(twins, '');
    expect(a.name).not.toBe(b.name);
  });

  it('numbers them by position', () => {
    expect(names(buildThemeChoices(twins, ''))).toEqual([
      '1. Repeated Name',
      '2. Repeated Name',
    ]);
  });

  it('gives each a different value', () => {
    const [a, b] = buildThemeChoices(twins, '');
    expect(a.value).not.toBe(b.value);
  });

  it('resolves each to its own position', () => {
    const [a, b] = buildThemeChoices(twins, '');
    expect(resolveThemeSelection(a.value, twins)).toEqual({
      ok: true,
      index: 0,
    });
    expect(resolveThemeSelection(b.value, twins)).toEqual({
      ok: true,
      index: 1,
    });
  });
});

// ─── the stale selection hazard ───────────────────────────────────────────────

// A client can hold suggestions open, so the list can change between the
// autocomplete response and the submit. A bare index would silently edit
// whatever moved into that slot.
describe('resolveThemeSelection refuses a selection that no longer means what was shown', () => {
  const before = list(5);

  it('accepts a selection when nothing has changed', () => {
    const choice = buildThemeChoices(before, '')[2];
    expect(resolveThemeSelection(choice.value, before)).toEqual({
      ok: true,
      index: 2,
    });
  });

  it('refuses when the theme at that position was renamed', () => {
    const choice = buildThemeChoices(before, '')[2];
    const after = [...before];
    after[2] = { name: 'Renamed Since', message: 'm' };

    expect(resolveThemeSelection(choice.value, after).ok).toBe(false);
  });

  it('refuses when a theme was inserted ahead of the selection', () => {
    const choice = buildThemeChoices(before, '')[2];
    const after = [{ name: 'Inserted First', message: 'm' }, ...before];

    expect(resolveThemeSelection(choice.value, after).ok).toBe(false);
  });

  it('refuses when the list shrank past the selected position', () => {
    const choice = buildThemeChoices(before, '')[4];
    expect(resolveThemeSelection(choice.value, before.slice(0, 2)).ok).toBe(
      false,
    );
  });

  it('refuses free text the admin typed instead of picking a suggestion', () => {
    expect(resolveThemeSelection('Fixture theme 3', before).ok).toBe(false);
  });

  it('refuses a bare index, which is what a stale client might send', () => {
    expect(resolveThemeSelection('2', before).ok).toBe(false);
  });

  it('refuses an empty value', () => {
    expect(resolveThemeSelection('', before).ok).toBe(false);
  });

  it('explains what to do rather than just failing', () => {
    const result = resolveThemeSelection('Fixture theme 3', before);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/run the command again/i);
  });

  // The whole point: refusing rather than editing the wrong entry.
  it('does not fall back to the position when the check fails', () => {
    const choice = buildThemeChoices(before, '')[2];
    const after = [...before];
    after[2] = { name: 'Renamed Since', message: 'm' };

    const result = resolveThemeSelection(choice.value, after);
    expect(result).not.toHaveProperty('index');
  });
});

describe('encodeThemeChoice', () => {
  it('encodes the position so it survives a reorder check', () => {
    const themes = list(3);
    expect(
      resolveThemeSelection(encodeThemeChoice(1, themes[1]), themes),
    ).toEqual({ ok: true, index: 1 });
  });

  it('produces a different value for a different name at the same position', () => {
    const a = encodeThemeChoice(0, { name: 'Monochrome', message: 'm' });
    const b = encodeThemeChoice(0, { name: 'Macro', message: 'm' });
    expect(a).not.toBe(b);
  });

  it('handles a malformed entry without throwing', () => {
    expect(() =>
      encodeThemeChoice(0, null as unknown as ThemeEntry),
    ).not.toThrow();
  });
});
