import { describe, it, expect } from 'vitest';
import { StringSelectMenuBuilder } from 'discord.js';
import type { ThemeEntry } from '../types';
import {
  MAX_SELECT_OPTIONS,
  buildThemeOptions,
  buildThemeSelectRow,
  resolveThemeIndex,
  themeNameText,
  themeMessageText,
} from '../commands/theme-picker';

// Every name shape that survives /theme-bot reorder-themes but reaches the raw
// setLabel/setValue path in edit-theme and delete-theme. This is the array that
// would have caught the 2026-08-30 outage.
const uglyThemes = [
  { name: 'Weekly Theme Thicc', message: 'a' },
  { name: 'Weekly Theme Thicc', message: 'b' }, // exact duplicate name
  { name: '', message: 'c' }, // empty name
  { name: '   ', message: 'd' }, // whitespace-only name
  { name: null, message: 'e' }, // non-string name
  { name: 7, message: 'f' }, // numeric name
  { name: 'x'.repeat(150), message: 'g' }, // over the 100 char label cap
  'legacy string theme', // legacy shape
] as unknown as ThemeEntry[];

describe('buildThemeOptions', () => {
  it('accepts every broken name shape without throwing', () => {
    expect(() => buildThemeOptions(uglyThemes)).not.toThrow();
  });

  it('produces one option per theme', () => {
    expect(buildThemeOptions(uglyThemes)).toHaveLength(uglyThemes.length);
  });

  it('gives every option a label within Discord 1 to 100 character limit', () => {
    for (const option of buildThemeOptions(uglyThemes)) {
      expect(option.label.length).toBeGreaterThanOrEqual(1);
      expect(option.label.length).toBeLessThanOrEqual(100);
    }
  });

  it('gives every option a unique value even when two names are identical', () => {
    const values = buildThemeOptions(uglyThemes).map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('numbers labels so duplicate names stay distinguishable to the admin', () => {
    const [first, second] = buildThemeOptions(uglyThemes);
    expect(first.label).toBe('1. Weekly Theme Thicc');
    expect(second.label).toBe('2. Weekly Theme Thicc');
  });

  it('labels an empty name as unnamed rather than throwing', () => {
    expect(buildThemeOptions(uglyThemes)[2].label).toBe('3. (unnamed)');
  });

  it('labels a whitespace-only name as unnamed', () => {
    expect(buildThemeOptions(uglyThemes)[3].label).toBe('4. (unnamed)');
  });

  it('labels a null name as unnamed', () => {
    expect(buildThemeOptions(uglyThemes)[4].label).toBe('5. (unnamed)');
  });

  it('coerces a numeric name to its string form', () => {
    expect(buildThemeOptions(uglyThemes)[5].label).toBe('6. 7');
  });

  it('keeps a legacy string theme readable', () => {
    expect(buildThemeOptions(uglyThemes)[7].label).toBe(
      '8. legacy string theme',
    );
  });

  it('caps the option list at the Discord maximum', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: `Theme ${i}`,
      message: 'm',
    }));
    expect(buildThemeOptions(many)).toHaveLength(MAX_SELECT_OPTIONS);
  });

  it('keeps 26 entries within the cap', () => {
    const twentySix = Array.from({ length: 26 }, (_, i) => ({
      name: `Theme ${i}`,
      message: 'm',
    }));
    expect(buildThemeOptions(twentySix).length).toBeLessThanOrEqual(
      MAX_SELECT_OPTIONS,
    );
  });
});

describe('buildThemeSelectRow', () => {
  it('produces a menu discord.js will serialize without throwing', () => {
    const row = buildThemeSelectRow(
      'editThemeSelect-1',
      'Pick one',
      uglyThemes,
    );
    expect(() => row.toJSON()).not.toThrow();
  });

  it('builds a real StringSelectMenuBuilder from the ugly array', () => {
    const row = buildThemeSelectRow(
      'editThemeSelect-1',
      'Pick one',
      uglyThemes,
    );
    const [menu] = row.components;
    expect(menu).toBeInstanceOf(StringSelectMenuBuilder);
    expect(menu.toJSON().options).toHaveLength(uglyThemes.length);
  });

  it('survives 26 themes, which is over the raw Discord cap', () => {
    const twentySix = Array.from({ length: 26 }, (_, i) => ({
      name: `Theme ${i}`,
      message: 'm',
    }));
    expect(() =>
      buildThemeSelectRow('x', 'p', twentySix).toJSON(),
    ).not.toThrow();
  });
});

// The modal pre-fills both fields with setValue, which rejects a non-string the
// same way setLabel does. Coercing here is what stops edit-theme throwing at
// showModal after the picker has already worked.
describe('themeNameText', () => {
  it('returns a normal name unchanged', () => {
    expect(themeNameText(uglyThemes[0])).toBe('Weekly Theme Thicc');
  });

  it('returns an empty string for a null name', () => {
    expect(themeNameText(uglyThemes[4])).toBe('');
  });

  it('coerces a numeric name to a string', () => {
    expect(themeNameText(uglyThemes[5])).toBe('7');
  });

  it('returns a legacy string theme as itself', () => {
    expect(themeNameText(uglyThemes[7])).toBe('legacy string theme');
  });

  it('never exceeds the text input limit', () => {
    const huge = { name: 'x'.repeat(9000) } as unknown as ThemeEntry;
    expect(themeNameText(huge).length).toBeLessThanOrEqual(4000);
  });
});

describe('themeMessageText', () => {
  it('returns the message of a normal theme', () => {
    expect(themeMessageText(uglyThemes[0])).toBe('a');
  });

  it('returns an empty string for a legacy string theme with no message', () => {
    expect(themeMessageText(uglyThemes[7])).toBe('');
  });

  it('returns an empty string when the message is missing', () => {
    expect(themeMessageText({ name: 'No Message' })).toBe('');
  });

  it('never exceeds the text input limit', () => {
    const huge = { name: 'a', message: 'y'.repeat(9000) };
    expect(themeMessageText(huge).length).toBeLessThanOrEqual(4000);
  });
});

describe('resolveThemeIndex', () => {
  it('resolves the selected value to that exact array position', () => {
    expect(resolveThemeIndex('5', uglyThemes)).toBe(5);
  });

  it('resolves to the second entry when two entries share a name', () => {
    const index = resolveThemeIndex('1', uglyThemes);
    expect(index).toBe(1);
    expect((uglyThemes[index] as { message: string }).message).toBe('b');
  });

  it('returns -1 for an index past the end of the list', () => {
    expect(resolveThemeIndex('99', uglyThemes)).toBe(-1);
  });

  it('returns -1 for a negative index', () => {
    expect(resolveThemeIndex('-1', uglyThemes)).toBe(-1);
  });

  it('returns -1 for a non-numeric value', () => {
    expect(resolveThemeIndex('Weekly Theme Thicc', uglyThemes)).toBe(-1);
  });
});
