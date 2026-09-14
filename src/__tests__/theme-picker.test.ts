import { describe, it, expect } from 'vitest';
import type { ThemeEntry } from '../types';
import {
  MAX_TEXT_INPUT,
  themeNameText,
  themeMessageText,
  themeOptionLabel,
} from '../commands/theme-picker';

/**
 * Every stored shape that a display has to survive. discord.js validates
 * synchronously in the builder, so an uncoerced value throws before the
 * interaction is acknowledged, which surfaces as "the application did not
 * respond" with no way to see why. This is the array that would have caught the
 * 2026-08-30 outage.
 *
 * Neutral fixture names.
 */
const uglyThemes = [
  { name: 'Repeated Name', message: 'a' },
  { name: 'Repeated Name', message: 'b' }, // exact duplicate name
  { name: '', message: 'c' }, // empty name
  { name: '   ', message: 'd' }, // whitespace-only name
  { name: null, message: 'e' }, // non-string name
  { name: 7, message: 'f' }, // numeric name
  { name: 'x'.repeat(150), message: 'g' }, // over the 100 char label cap
  'legacy string theme', // legacy shape
] as unknown as ThemeEntry[];

// The modal pre-fills both fields with setValue, which rejects a non-string the
// same way setLabel does. Coercing here is what stops edit-theme throwing at
// showModal.
describe('themeNameText', () => {
  it('returns a normal name unchanged', () => {
    expect(themeNameText(uglyThemes[0])).toBe('Repeated Name');
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

  it('returns an empty string for a null entry', () => {
    expect(themeNameText(null as unknown as ThemeEntry)).toBe('');
  });

  it('never exceeds the text input limit', () => {
    const huge = { name: 'x'.repeat(9000) } as unknown as ThemeEntry;
    expect(themeNameText(huge).length).toBeLessThanOrEqual(MAX_TEXT_INPUT);
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

  it('returns an empty string for a null entry', () => {
    expect(themeMessageText(null as unknown as ThemeEntry)).toBe('');
  });

  it('never exceeds the text input limit', () => {
    const huge = { name: 'a', message: 'y'.repeat(9000) };
    expect(themeMessageText(huge).length).toBeLessThanOrEqual(MAX_TEXT_INPUT);
  });
});

// The numbered label is what kept two themes sharing a name distinguishable in
// August, and it is now what an autocomplete choice name carries.
describe('themeOptionLabel', () => {
  it('numbers a label from one', () => {
    expect(themeOptionLabel(uglyThemes[0], 0)).toBe('1. Repeated Name');
  });

  it('keeps two identical names apart by position', () => {
    expect(themeOptionLabel(uglyThemes[0], 0)).not.toBe(
      themeOptionLabel(uglyThemes[1], 1),
    );
  });

  it('labels an empty name as unnamed rather than throwing', () => {
    expect(themeOptionLabel(uglyThemes[2], 2)).toBe('3. (unnamed)');
  });

  it('labels a whitespace-only name as unnamed', () => {
    expect(themeOptionLabel(uglyThemes[3], 3)).toBe('4. (unnamed)');
  });

  it('labels a null name as unnamed', () => {
    expect(themeOptionLabel(uglyThemes[4], 4)).toBe('5. (unnamed)');
  });

  it('coerces a numeric name to its string form', () => {
    expect(themeOptionLabel(uglyThemes[5], 5)).toBe('6. 7');
  });

  it('keeps a legacy string theme readable', () => {
    expect(themeOptionLabel(uglyThemes[7], 7)).toBe('8. legacy string theme');
  });

  it('never exceeds the 100 character cap that labels and choice names share', () => {
    for (let i = 0; i < uglyThemes.length; i++) {
      expect(themeOptionLabel(uglyThemes[i], i).length).toBeLessThanOrEqual(
        100,
      );
    }
  });

  it('gives every label at least one character', () => {
    for (let i = 0; i < uglyThemes.length; i++) {
      expect(themeOptionLabel(uglyThemes[i], i).length).toBeGreaterThanOrEqual(
        1,
      );
    }
  });
});
