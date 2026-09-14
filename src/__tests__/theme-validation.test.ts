import { describe, it, expect } from 'vitest';

import { normalizeChannelName } from '../channel-name';
import { themeOptionLabel } from '../commands/theme-picker';
import {
  MAX_THEME_MESSAGE,
  MAX_THEME_NAME,
  validateThemeMessage,
  validateThemeName,
} from '../theme-validation';

// The fourteen names actually on the Fly volume as of 2026-09-01. Any change to
// normalization has to leave every one of these renaming the channel exactly as
// it does today, or a deploy silently renames a live channel.
const LIVE_THEME_NAMES = [
  'Weekly theme animal style',
  'Weekly theme nipples',
  'Weekly theme senses',
  'Weekly theme silly and playful',
  'Weekly theme food play',
  'Weekly theme bondage',
  'Weekly theme wet and messy',
  'Weekly theme impact play',
  'Weekly theme toys',
  'Weekly theme sensory play',
  'Weekly theme aesthetic',
  'Weekly theme wet and wild',
  'Weekly theme thicc and thirsty',
  'Weekly theme butt stuff',
];

// ─── the rotation wedge ───────────────────────────────────────────────────────

// A name with nothing left after normalization throws inside rotateTheme, and
// because setStateIndex sits after the throw site the index never advances, so
// every following week retries the same entry forever. Rejecting at the write
// is the fix: a permanent failure must never become a stored theme.
describe('validateThemeName rejects names that cannot become a channel name', () => {
  it('rejects an emoji-only name', () => {
    expect(() => validateThemeName('🔥🔥🔥')).toThrow(/channel name/i);
  });

  it('rejects a name with no Latin characters', () => {
    expect(() => validateThemeName('日本語テーマ')).toThrow(/channel name/i);
  });

  it('rejects a punctuation-only name', () => {
    expect(() => validateThemeName('!!!')).toThrow(/channel name/i);
  });

  it('rejects a whitespace-only name', () => {
    expect(() => validateThemeName('   ')).toThrow(/empty/i);
  });

  it('names the offending value in the error so the admin can see why', () => {
    expect(() => validateThemeName('🔥🔥🔥')).toThrow(/🔥🔥🔥/);
  });
});

// ─── length ───────────────────────────────────────────────────────────────────

describe('validateThemeName length', () => {
  it(`accepts a name of exactly ${MAX_THEME_NAME} characters`, () => {
    expect(validateThemeName('a'.repeat(MAX_THEME_NAME))).toHaveLength(
      MAX_THEME_NAME,
    );
  });

  it(`rejects a name of ${MAX_THEME_NAME + 1} characters`, () => {
    expect(() => validateThemeName('a'.repeat(MAX_THEME_NAME + 1))).toThrow(
      new RegExp(`${MAX_THEME_NAME} characters`),
    );
  });

  // 96 characters is where reorder-themes throws today, before the interaction
  // is ever acknowledged.
  it('rejects the 120 character name that breaks reorder-themes today', () => {
    expect(() => validateThemeName('x'.repeat(120))).toThrow(
      new RegExp(`${MAX_THEME_NAME} characters`),
    );
  });
});

// ─── the cap leaves room for the position prefix ──────────────────────────────

// A select option label and an autocomplete choice name both cap at 100, and
// both carry a "N. " prefix so that two themes sharing a name stay apart. If a
// name could fill the whole 100 the prefix would force truncation, which is
// exactly the disambiguation the August repair depended on. The cap is set at
// the write so the display never has to truncate.
describe('the name cap leaves room for a three digit position prefix', () => {
  const WIDEST_PREFIX = '999. ';

  it('fits a maximum length name plus the widest prefix inside 100 characters', () => {
    expect(WIDEST_PREFIX.length + MAX_THEME_NAME).toBeLessThanOrEqual(100);
  });

  it('labels a maximum length name at position 999 without truncating it', () => {
    const name = 'a'.repeat(MAX_THEME_NAME);
    const label = themeOptionLabel({ name, message: 'm' }, 998);

    expect(label).toBe(`999. ${name}`);
    expect(label.length).toBeLessThanOrEqual(100);
  });

  it('keeps the whole name visible at every position up to 999', () => {
    const name = 'a'.repeat(MAX_THEME_NAME);
    for (const index of [0, 8, 9, 98, 99, 998]) {
      const label = themeOptionLabel({ name, message: 'm' }, index);
      expect(label.endsWith(name)).toBe(true);
      expect(label.length).toBeLessThanOrEqual(100);
    }
  });
});

describe('validateThemeMessage length', () => {
  it(`accepts a message of exactly ${MAX_THEME_MESSAGE} characters`, () => {
    expect(validateThemeMessage('a'.repeat(MAX_THEME_MESSAGE))).toHaveLength(
      MAX_THEME_MESSAGE,
    );
  });

  // Over 2000 the announcement is rejected by the API, and rotateTheme swallows
  // that failure, so the rename lands and the message silently never posts.
  it(`rejects a message of ${MAX_THEME_MESSAGE + 1} characters`, () => {
    expect(() =>
      validateThemeMessage('a'.repeat(MAX_THEME_MESSAGE + 1)),
    ).toThrow(/2000 characters/);
  });
});

// ─── the hand-edited file path ────────────────────────────────────────────────

// themes.json gets edited directly on the Fly volume, which bypasses every
// modal, so the store cannot assume it is being handed a string.
describe('validateThemeName rejects values a hand-edited file can produce', () => {
  it('rejects a number', () => {
    expect(() => validateThemeName(2026)).toThrow(/text/i);
  });

  it('rejects null', () => {
    expect(() => validateThemeName(null)).toThrow(/text/i);
  });

  it('rejects an empty string', () => {
    expect(() => validateThemeName('')).toThrow(/empty/i);
  });
});

// ─── trimming ─────────────────────────────────────────────────────────────────

describe('validateThemeName trims', () => {
  it('returns the name without surrounding whitespace', () => {
    expect(validateThemeName('  Weekly theme toys  ')).toBe(
      'Weekly theme toys',
    );
  });
});

// ─── accented characters ──────────────────────────────────────────────────────

// Accents are currently deleted rather than folded, so "Café Night" silently
// becomes "caf-night". Discord accepts accented channel names, so the
// restriction is the bot's own. Folding preserves the admin's intent without
// changing any name that is already plain ASCII.
describe('normalizeChannelName folds accents instead of deleting them', () => {
  it('turns "Café Night" into "cafe-night"', () => {
    expect(normalizeChannelName('Café Night')).toBe('cafe-night');
  });

  it('turns "Weekly théme ÉTÉ" into "weekly-theme-ete"', () => {
    expect(normalizeChannelName('Weekly théme ÉTÉ')).toBe('weekly-theme-ete');
  });

  it('accepts an accented name at the write path', () => {
    expect(validateThemeName('Café Night')).toBe('Café Night');
  });
});

// The whole point of folding rather than permitting: no live channel name moves.
describe('normalizeChannelName leaves every live theme name unchanged', () => {
  for (const name of LIVE_THEME_NAMES) {
    it(`renames "${name}" the same way it does today`, () => {
      const expected = name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .slice(0, 100);
      expect(normalizeChannelName(name)).toBe(expected);
    });
  }
});

// ─── the echo ─────────────────────────────────────────────────────────────────

// Section 6 shows the admin what the channel will actually be called. It is
// normalizeChannelName itself, called on an already validated name, so it
// cannot throw at the point of display.
describe('the channel name shown back to the admin', () => {
  it('shows what the channel will actually be called', () => {
    expect(normalizeChannelName('Weekly Theme Toys')).toBe('weekly-theme-toys');
  });

  it('shows the folded form of an accented name', () => {
    expect(normalizeChannelName('Café Night')).toBe('cafe-night');
  });
});
