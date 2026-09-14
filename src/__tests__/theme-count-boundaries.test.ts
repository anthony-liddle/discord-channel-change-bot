import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

vi.mock('../themes', () => ({
  getThemes: vi.fn(),
  updateTheme: vi.fn(),
  deleteTheme: vi.fn(),
  saveThemes: vi.fn(),
  THEMES_PATH: '/tmp/test-themes.json',
}));

vi.mock('../state', () => ({
  getState: vi.fn(() => ({ currentIndex: 0 })),
  saveState: vi.fn(),
  STATE_PATH: '/tmp/test-state.json',
}));

import { getThemes } from '../themes';
import { reorderThemesCmd } from '../commands/reorder-themes';
import { MAX_SELECT_OPTIONS } from '../commands/theme-picker';
import { MAX_THEME_MESSAGE } from '../theme-validation';

/**
 * The 2026-09-14 ceiling report had to work out what happens at 26 themes by
 * reading every guard by hand, because nothing tested it. These name the
 * command and the count so the next person reads a test name instead.
 *
 * edit-theme and delete-theme moved to theme-option-handlers.test.ts when they
 * stopped using a select menu and started taking an autocompleted option.
 *
 * 24 is under the cap, 25 is exactly the cap, 26 is the first count that
 * refuses, and 200 is the far side of any plausible growth.
 */
const COUNTS = [24, 25, 26, 200];

function themeList(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `Weekly theme ${i + 1}`,
    message: `Message ${i + 1}`,
  }));
}

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
};

// Never resolves, so the handler parks at its collector after the guard has
// either fired or not. What matters is what it said before it got there.
const pending = () => new Promise(() => {});

function makeDeferred() {
  const response = { awaitMessageComponent: vi.fn(pending) };
  return {
    id: 'inv-1',
    user: { id: 'user-1' },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(response),
    reply: vi.fn().mockResolvedValue(response),
    followUp: vi.fn().mockResolvedValue(undefined),
    awaitModalSubmit: vi.fn(pending),
  };
}

const textOf = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map((c) => (c[0] as { content?: string })?.content ?? '');

const refused = (texts: string[]) =>
  texts.some((t) => t.includes('A Discord menu can only offer'));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reorder-themes at each theme count', () => {
  for (const count of COUNTS) {
    const over = count > MAX_SELECT_OPTIONS;

    it(`reorder-themes at ${count} themes ${over ? 'refuses with the over limit message' : 'shows the numbered list'}`, async () => {
      vi.mocked(getThemes).mockResolvedValue(themeList(count));
      const i = makeDeferred();

      void reorderThemesCmd(
        i as unknown as ChatInputCommandInteraction,
        {} as never,
      );
      await settle();

      expect(refused(textOf(i.reply))).toBe(over);
    });

    if (count <= 25) {
      it(`reorder-themes at ${count} themes keeps its list inside the ${MAX_THEME_MESSAGE} character message cap`, async () => {
        vi.mocked(getThemes).mockResolvedValue(themeList(count));
        const i = makeDeferred();

        void reorderThemesCmd(
          i as unknown as ChatInputCommandInteraction,
          {} as never,
        );
        await settle();

        for (const text of textOf(i.reply)) {
          expect(text.length).toBeLessThanOrEqual(MAX_THEME_MESSAGE);
        }
      });
    }
  }
});
