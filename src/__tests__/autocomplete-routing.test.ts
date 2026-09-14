import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { AutocompleteInteraction } from 'discord.js';

vi.mock('../themes', () => ({
  getThemes: vi.fn(),
  THEMES_PATH: '/tmp/test-themes.json',
}));

import { getThemes } from '../themes';
import { handleThemeAutocomplete } from '../commands/theme-autocomplete';

/**
 * src/index.ts dropped every autocomplete event, so this path did not exist.
 * An autocomplete response cannot be deferred and cannot show an error, so the
 * only sane failure is an empty list of suggestions: never a throw, which would
 * take the process down through the unhandled rejection path.
 */

const themes = [
  { name: 'Monochrome', message: 'm' },
  { name: 'Macro', message: 'm' },
  { name: 'Golden Hour', message: 'm' },
];

function makeAutocomplete(
  sub: string,
  focused: string,
  group: string | null = null,
) {
  return {
    commandName: 'theme-bot',
    options: {
      getSubcommandGroup: vi.fn(() => group),
      getSubcommand: vi.fn(() => sub),
      getFocused: vi.fn(() => focused),
    },
    respond: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getThemes).mockResolvedValue(themes);
});

describe('handleThemeAutocomplete answers the commands that take a theme', () => {
  for (const sub of ['edit-theme', 'delete-theme']) {
    it(`responds with suggestions for ${sub}`, async () => {
      const i = makeAutocomplete(sub, '');

      await handleThemeAutocomplete(i as unknown as AutocompleteInteraction);

      expect(i.respond).toHaveBeenCalledTimes(1);
      expect(i.respond.mock.calls[0][0]).toHaveLength(3);
    });

    it(`narrows suggestions for ${sub} using what has been typed`, async () => {
      const i = makeAutocomplete(sub, 'golden');

      await handleThemeAutocomplete(i as unknown as AutocompleteInteraction);

      expect(i.respond.mock.calls[0][0]).toHaveLength(1);
    });
  }

  it('ignores a command that has no theme option', async () => {
    const i = makeAutocomplete('themes', '');

    await handleThemeAutocomplete(i as unknown as AutocompleteInteraction);

    expect(i.respond).not.toHaveBeenCalled();
  });

  it('ignores a config subcommand', async () => {
    const i = makeAutocomplete('schedule', '', 'config');

    await handleThemeAutocomplete(i as unknown as AutocompleteInteraction);

    expect(i.respond).not.toHaveBeenCalled();
  });
});

describe('handleThemeAutocomplete never throws', () => {
  it('survives the theme store failing', async () => {
    vi.mocked(getThemes).mockRejectedValue(new Error('disk gone'));
    const i = makeAutocomplete('edit-theme', '');

    await expect(
      handleThemeAutocomplete(i as unknown as AutocompleteInteraction),
    ).resolves.toBeUndefined();
  });

  it('survives respond failing, which is what an expired token looks like', async () => {
    const i = makeAutocomplete('edit-theme', '');
    i.respond.mockRejectedValue(new Error('Unknown interaction'));

    await expect(
      handleThemeAutocomplete(i as unknown as AutocompleteInteraction),
    ).resolves.toBeUndefined();
  });

  it('logs rather than staying silent when it cannot answer', async () => {
    vi.mocked(getThemes).mockRejectedValue(new Error('disk gone'));
    const i = makeAutocomplete('edit-theme', '');

    await handleThemeAutocomplete(i as unknown as AutocompleteInteraction);

    expect(console.error).toHaveBeenCalled();
  });
});
