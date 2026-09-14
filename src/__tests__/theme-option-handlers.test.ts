import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ThemeEntry } from '../types';

vi.mock('../themes', () => ({
  getThemes: vi.fn(),
  updateTheme: vi.fn(),
  deleteTheme: vi.fn(),
  THEMES_PATH: '/tmp/test-themes.json',
}));

import { getThemes, updateTheme, deleteTheme } from '../themes';
import { editThemeCmd } from '../commands/edit-theme';
import { deleteThemeCmd } from '../commands/delete-theme';
import {
  THEME_OPTION,
  buildThemeChoices,
  encodeThemeChoice,
} from '../commands/theme-autocomplete';

/**
 * edit-theme and delete-theme now take a required `theme` option answered by
 * autocomplete, so neither builds a select menu and neither has an opinion
 * about how many themes exist. These pin that at the counts the ceiling report
 * had to trace by hand.
 *
 * Neutral fixture names throughout.
 */

const COUNTS = [24, 25, 26, 200];

const list = (n: number): ThemeEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Fixture theme ${i + 1}`,
    message: `Message ${i + 1}`,
  }));

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
};

const pending = () => new Promise(() => {});

function makeInteraction(optionValue: string) {
  const response = { awaitMessageComponent: vi.fn(pending) };
  return {
    id: 'inv-1',
    user: { id: 'user-1' },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: { getString: vi.fn(() => optionValue) },
    showModal: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(response),
    reply: vi.fn().mockResolvedValue(response),
    followUp: vi.fn().mockResolvedValue(undefined),
    awaitModalSubmit: vi.fn(pending),
  };
}

const said = (i: ReturnType<typeof makeInteraction>) =>
  [...i.reply.mock.calls, ...i.editReply.mock.calls]
    .map((c) => (c[0] as { content?: string })?.content ?? '')
    .join('\n');

/** The value the admin's client would send after picking theme `index`. */
const pick = (themes: ThemeEntry[], index: number) =>
  encodeThemeChoice(index, themes[index]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateTheme).mockResolvedValue(undefined);
  vi.mocked(deleteTheme).mockResolvedValue(undefined);
});

describe('edit-theme at each theme count', () => {
  for (const count of COUNTS) {
    it(`edit-theme at ${count} themes opens the modal for the chosen theme`, async () => {
      const themes = list(count);
      vi.mocked(getThemes).mockResolvedValue(themes);
      const i = makeInteraction(pick(themes, count - 1));

      void editThemeCmd(
        i as unknown as ChatInputCommandInteraction,
        {} as never,
      );
      await settle();

      expect(i.showModal).toHaveBeenCalled();
    });

    it(`edit-theme at ${count} themes never refuses for being over a menu limit`, async () => {
      const themes = list(count);
      vi.mocked(getThemes).mockResolvedValue(themes);
      const i = makeInteraction(pick(themes, 0));

      void editThemeCmd(
        i as unknown as ChatInputCommandInteraction,
        {} as never,
      );
      await settle();

      expect(said(i)).not.toMatch(/menu can only offer/i);
    });

    it(`edit-theme at ${count} themes builds no select menu`, async () => {
      const themes = list(count);
      vi.mocked(getThemes).mockResolvedValue(themes);
      const i = makeInteraction(pick(themes, 0));

      void editThemeCmd(
        i as unknown as ChatInputCommandInteraction,
        {} as never,
      );
      await settle();

      const everyPayload = [...i.reply.mock.calls, ...i.editReply.mock.calls];
      for (const [payload] of everyPayload) {
        expect(
          ((payload as { components?: unknown[] }).components ?? []).length,
        ).toBe(0);
      }
    });
  }
});

describe('delete-theme at each theme count', () => {
  for (const count of COUNTS) {
    it(`delete-theme at ${count} themes asks for confirmation of the chosen theme`, async () => {
      const themes = list(count);
      vi.mocked(getThemes).mockResolvedValue(themes);
      const i = makeInteraction(pick(themes, count - 1));

      void deleteThemeCmd(
        i as unknown as ChatInputCommandInteraction,
        {} as never,
      );
      await settle();

      expect(said(i)).toMatch(new RegExp(`Fixture theme ${count}`));
    });

    it(`delete-theme at ${count} themes never refuses for being over a menu limit`, async () => {
      const themes = list(count);
      vi.mocked(getThemes).mockResolvedValue(themes);
      const i = makeInteraction(pick(themes, 0));

      void deleteThemeCmd(
        i as unknown as ChatInputCommandInteraction,
        {} as never,
      );
      await settle();

      expect(said(i)).not.toMatch(/menu can only offer/i);
    });
  }
});

describe('autocomplete at each theme count', () => {
  for (const count of COUNTS) {
    it(`autocomplete at ${count} themes offers at most 25 choices`, () => {
      expect(buildThemeChoices(list(count), '').length).toBeLessThanOrEqual(25);
    });

    it(`autocomplete at ${count} themes can still reach the last theme by name`, () => {
      const themes = list(count);
      const choices = buildThemeChoices(themes, `theme ${count}`);
      expect(
        choices.some((c) => c.name.endsWith(`Fixture theme ${count}`)),
      ).toBe(true);
    });
  }
});

// The hazard autocomplete makes worse: a client can hold suggestions open, so
// the list can move between the suggestion and the submit.
describe('a stale selection is refused rather than applied to the wrong theme', () => {
  it('edit-theme refuses and writes nothing when the chosen theme was renamed', async () => {
    const before = list(5);
    const value = pick(before, 2);
    const after = [...before];
    after[2] = { name: 'Renamed Since', message: 'm' };
    vi.mocked(getThemes).mockResolvedValue(after);
    const i = makeInteraction(value);

    void editThemeCmd(i as unknown as ChatInputCommandInteraction, {} as never);
    await settle();

    expect(updateTheme).not.toHaveBeenCalled();
    expect(i.showModal).not.toHaveBeenCalled();
    expect(said(i)).toMatch(/list changed|not the one that was suggested/i);
  });

  it('delete-theme refuses and deletes nothing when the chosen theme was renamed', async () => {
    const before = list(5);
    const value = pick(before, 2);
    const after = [...before];
    after[2] = { name: 'Renamed Since', message: 'm' };
    vi.mocked(getThemes).mockResolvedValue(after);
    const i = makeInteraction(value);

    void deleteThemeCmd(
      i as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    expect(deleteTheme).not.toHaveBeenCalled();
  });

  it('edit-theme refuses free text typed instead of picking a suggestion', async () => {
    vi.mocked(getThemes).mockResolvedValue(list(5));
    const i = makeInteraction('Fixture theme 3');

    void editThemeCmd(i as unknown as ChatInputCommandInteraction, {} as never);
    await settle();

    expect(i.showModal).not.toHaveBeenCalled();
    expect(said(i)).toMatch(/not a theme from the list/i);
  });

  it('reads the option by its registered name', async () => {
    const themes = list(5);
    vi.mocked(getThemes).mockResolvedValue(themes);
    const i = makeInteraction(pick(themes, 0));

    void editThemeCmd(i as unknown as ChatInputCommandInteraction, {} as never);
    await settle();

    expect(i.options.getString).toHaveBeenCalledWith(THEME_OPTION, true);
  });
});

describe('an empty theme list', () => {
  it('edit-theme says there is nothing to edit rather than refusing the option', async () => {
    vi.mocked(getThemes).mockResolvedValue([]);
    const i = makeInteraction('0:x');

    void editThemeCmd(i as unknown as ChatInputCommandInteraction, {} as never);
    await settle();

    expect(said(i)).toMatch(/no themes/i);
  });
});
