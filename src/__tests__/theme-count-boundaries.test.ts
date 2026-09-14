import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ThemeEntry } from '../types';

vi.mock('../themes', () => ({
  getThemes: vi.fn(),
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
import { MAX_THEME_NAME } from '../theme-validation';

/**
 * The 2026-09-14 ceiling report had to work out what happens at 26 themes by
 * reading every guard by hand, because nothing tested it. These name the
 * command and the count so the next person reads a test name instead.
 *
 * edit-theme, delete-theme and autocomplete live in
 * theme-option-handlers.test.ts, where they stopped having an opinion about the
 * theme count at all. This file is reorder, which still shows the whole list
 * and so had the harder problem.
 *
 * Neutral fixture names throughout.
 */

const COUNTS = [24, 25, 26, 200];

const list = (n: number, nameLength = 20): ThemeEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Fixture ${i + 1}`.padEnd(nameLength, 'x').slice(0, nameLength),
    message: `Message ${i + 1}`,
  }));

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
};

// Never resolves, so the handler parks at its collector after the first render.
const pending = () => new Promise(() => {});

function makeInteraction() {
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

const shown = (i: ReturnType<typeof makeInteraction>) =>
  i.editReply.mock.calls
    .map((c) => (c[0] as { content?: string })?.content ?? '')
    .join('\n');

async function runReorder(themes: ThemeEntry[]) {
  vi.mocked(getThemes).mockResolvedValue(themes);
  const i = makeInteraction();
  void reorderThemesCmd(
    i as unknown as ChatInputCommandInteraction,
    {} as never,
  );
  await settle();
  return i;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reorder-themes at each theme count', () => {
  for (const count of COUNTS) {
    it(`reorder-themes at ${count} themes shows the list instead of refusing`, async () => {
      const i = await runReorder(list(count));

      expect(shown(i)).toContain('Theme order');
      expect(shown(i)).not.toMatch(/menu can only offer/i);
    });

    it(`reorder-themes at ${count} themes acknowledges before building any component`, async () => {
      const i = await runReorder(list(count));

      expect(i.deferReply).toHaveBeenCalled();
    });

    it(`reorder-themes at ${count} themes keeps every message inside the 2000 character cap`, async () => {
      const i = await runReorder(list(count, MAX_THEME_NAME));

      for (const call of i.editReply.mock.calls) {
        const content = (call[0] as { content?: string })?.content ?? '';
        expect(content.length).toBeLessThanOrEqual(2000);
      }
    });

    it(`reorder-themes at ${count} themes offers a move control rather than one step buttons`, async () => {
      const i = await runReorder(list(count));

      const row = (
        i.editReply.mock.calls[0][0] as {
          components?: { toJSON(): { components: { label?: string }[] } }[];
        }
      ).components?.[0];
      const labels = row?.toJSON().components.map((c) => c.label) ?? [];

      expect(labels).toContain('Move');
      expect(labels).not.toContain('↑ Move Up');
    });
  }
});

describe('reorder-themes still handles the degenerate lists', () => {
  it('says there is nothing to reorder when the list is empty', async () => {
    const i = await runReorder([]);
    expect(shown(i)).toMatch(/no themes/i);
  });

  it('says there is nothing to reorder with a single theme', async () => {
    const i = await runReorder(list(1));
    expect(shown(i)).toMatch(/only one theme/i);
  });
});
