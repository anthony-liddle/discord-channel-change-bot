import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeChannelName,
  getThemeName,
  getThemeMessage,
  getUpcomingThemes,
} from '../rotation';

vi.mock('../state', () => ({
  getState: vi.fn(() => ({ currentIndex: 0 })),
}));

import { getState } from '../state';

// ─── normalizeChannelName ────────────────────────────────────────────────────

describe('normalizeChannelName', () => {
  it('converts spaces to hyphens', () => {
    expect(normalizeChannelName('hello world')).toBe('hello-world');
  });

  it('converts to lowercase', () => {
    expect(normalizeChannelName('Hello World')).toBe('hello-world');
  });

  it('strips special characters', () => {
    expect(normalizeChannelName('hello!@#world')).toBe('helloworld');
  });

  it('preserves hyphens and underscores', () => {
    expect(normalizeChannelName('hello-world_foo')).toBe('hello-world_foo');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    expect(normalizeChannelName('hello   world')).toBe('hello-world');
  });

  it('truncates to 100 characters', () => {
    expect(normalizeChannelName('a'.repeat(200))).toHaveLength(100);
  });

  it('throws on an empty string', () => {
    expect(() => normalizeChannelName('')).toThrow(
      'Channel name must be a non-empty string',
    );
  });

  it('throws when the result is empty after normalization', () => {
    expect(() => normalizeChannelName('!@#$%')).toThrow(
      'Channel name must have at least 1 valid character after normalization',
    );
  });
});

// ─── getThemeName ────────────────────────────────────────────────────────────

describe('getThemeName', () => {
  it('returns the name from a Theme object', () => {
    expect(
      getThemeName({ name: 'weekly-movies', message: 'Watch movies!' }),
    ).toBe('weekly-movies');
  });

  it('returns the string itself for a legacy string theme', () => {
    expect(getThemeName('weekly-music')).toBe('weekly-music');
  });
});

// ─── getThemeMessage ─────────────────────────────────────────────────────────

describe('getThemeMessage', () => {
  it('returns the message from a Theme object', () => {
    expect(
      getThemeMessage({ name: 'weekly-movies', message: 'Watch movies!' }),
    ).toBe('Watch movies!');
  });

  it('returns null for a legacy string theme', () => {
    expect(getThemeMessage('weekly-music')).toBeNull();
  });

  it('returns null when message is not set on a Theme object', () => {
    expect(getThemeMessage({ name: 'weekly-movies' })).toBeNull();
  });
});

// ─── getUpcomingThemes ───────────────────────────────────────────────────────

describe('getUpcomingThemes', () => {
  const themes = [
    { name: 'movies', message: 'Watch movies!' },
    { name: 'music', message: 'Listen to music!' },
    { name: 'games', message: 'Play games!' },
  ];

  beforeEach(() => {
    vi.mocked(getState).mockReturnValue({ currentIndex: 0 });
  });

  it('returns an empty array when given no themes', () => {
    expect(getUpcomingThemes([])).toEqual([]);
  });

  it('returns upcoming themes in order from the current index', () => {
    const result = getUpcomingThemes(themes, 2);
    expect(result[0].name).toBe('movies');
    expect(result[1].name).toBe('music');
  });

  it('marks only the first item as current', () => {
    const result = getUpcomingThemes(themes, 3);
    expect(result.map((r) => r.isCurrent)).toEqual([true, false, false]);
  });

  it('assigns sequential week numbers starting at 1', () => {
    const result = getUpcomingThemes(themes, 3);
    expect(result.map((r) => r.week)).toEqual([1, 2, 3]);
  });

  it('wraps around to the beginning when the end of the list is reached', () => {
    vi.mocked(getState).mockReturnValue({ currentIndex: 2 });
    const result = getUpcomingThemes(themes, 3);
    expect(result.map((r) => r.name)).toEqual(['games', 'movies', 'music']);
  });

  it('limits results to the requested count', () => {
    expect(getUpcomingThemes(themes, 2)).toHaveLength(2);
  });

  it('limits results to themes.length when count exceeds it', () => {
    expect(getUpcomingThemes(themes, 10)).toHaveLength(3);
  });

  it('handles legacy string themes', () => {
    const result = getUpcomingThemes(['legacy-theme'], 1);
    expect(result[0].name).toBe('legacy-theme');
    expect(result[0].message).toBeNull();
  });

  it('includes the theme message in results', () => {
    const result = getUpcomingThemes(themes, 1);
    expect(result[0].message).toBe('Watch movies!');
  });
});
