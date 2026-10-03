import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ThemeEntry } from '../types';

// The real theme store, with only the file system mocked, so "deleted the
// right one" is read from what was actually written rather than from which
// index a mock was handed.
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  },
}));

import fsp from 'fs/promises';
import { reloadThemes } from '../themes';
import { encodeThemeChoice } from '../commands/theme-autocomplete';
import { deleteThemeCmd } from '../commands/delete-theme';

const themes: ThemeEntry[] = [
  { name: 'Weekly theme origami', message: 'Fold something.' },
  { name: 'Weekly theme pottery', message: 'Show us.' },
  { name: 'Weekly theme jazz', message: 'Play something.' },
];

async function storeHolds(list: ThemeEntry[]) {
  vi.mocked(fsp.readFile).mockResolvedValue(
    JSON.stringify({ themes: list }) as never,
  );
  await reloadThemes();
}

type Click = 'confirm' | 'cancel' | null;

/** One run of the command, ending in a click on a button or in a timeout. */
function invocation(index: number, click: Click) {
  const button = {
    customId: '',
    update: vi.fn().mockResolvedValue(undefined),
  };
  const response = {
    awaitMessageComponent: vi.fn(
      ({ filter }: { filter: (i: unknown) => boolean }) => {
        if (click === null) {
          return Promise.reject(
            new Error('Collector received no interactions'),
          );
        }
        button.customId =
          click === 'confirm'
            ? 'deleteThemeConfirm-inv-1'
            : 'deleteThemeCancel-inv-1';
        return Promise.resolve(
          filter({ ...button, user: { id: 'admin-1' } }) ? button : null,
        );
      },
    ),
  };
  const interaction = {
    id: 'inv-1',
    user: { id: 'admin-1' },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: {
      getString: vi.fn(() => encodeThemeChoice(index, themes[index])),
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(response),
  };
  return { interaction, button, response };
}

async function run(interaction: ReturnType<typeof invocation>['interaction']) {
  await deleteThemeCmd(
    interaction as unknown as ChatInputCommandInteraction,
    {} as never,
  );
}

const contentOf = (fn: ReturnType<typeof vi.fn>) =>
  (fn.mock.calls.at(-1)![0] as { content: string }).content;

function written(): string[] {
  const body = vi.mocked(fsp.writeFile).mock.calls.at(-1)![1] as string;
  return JSON.parse(body).themes.map((t: { name: string }) => t.name);
}

beforeEach(async () => {
  await storeHolds(themes);
  vi.mocked(fsp.writeFile).mockClear();
});

describe('delete-theme asks first', () => {
  it('names the theme and its position before deleting anything', async () => {
    const { interaction } = invocation(1, null);

    await run(interaction);

    expect(
      (interaction.editReply.mock.calls[0][0] as { content: string }).content,
    ).toBe(
      'Are you sure you want to delete **2. Weekly theme pottery**? This cannot be undone.',
    );
  });

  it('says so when there is nothing to delete', async () => {
    await storeHolds([]);
    const { interaction } = invocation(0, 'confirm');

    await run(interaction);

    expect(contentOf(interaction.editReply)).toBe('No themes to delete.');
    expect(fsp.writeFile).not.toHaveBeenCalled();
  });
});

describe('confirming', () => {
  it('deletes the chosen theme and keeps the rest in order', async () => {
    const { interaction } = invocation(1, 'confirm');

    await run(interaction);

    expect(written()).toEqual(['Weekly theme origami', 'Weekly theme jazz']);
  });

  it('says which theme was deleted', async () => {
    const { interaction, button } = invocation(1, 'confirm');

    await run(interaction);

    expect(contentOf(button.update)).toBe(
      'Theme **2. Weekly theme pottery** has been deleted.',
    );
  });

  it('says the delete failed, with the reason, when the file cannot be written', async () => {
    vi.mocked(fsp.writeFile).mockRejectedValueOnce(
      new Error('ENOSPC: no space left on device'),
    );
    const { interaction, button } = invocation(1, 'confirm');

    await run(interaction);

    expect(contentOf(button.update)).toBe(
      'Failed to delete theme.\n> ENOSPC: no space left on device',
    );
  });
});

describe('not confirming deletes nothing', () => {
  it('cancels', async () => {
    const { interaction, button } = invocation(1, 'cancel');

    await run(interaction);

    expect(contentOf(button.update)).toBe('Cancelled.');
    expect(fsp.writeFile).not.toHaveBeenCalled();
  });

  it('times out', async () => {
    const { interaction } = invocation(1, null);

    await run(interaction);

    expect(contentOf(interaction.editReply)).toBe('Timed out.');
    expect(fsp.writeFile).not.toHaveBeenCalled();
  });

  // The confirmation is ephemeral, but the collector still checks who
  // clicked: only the admin who asked can confirm the delete.
  it('ignores a click from anyone but the admin who asked', async () => {
    const { interaction, response } = invocation(1, null);

    await run(interaction);

    const { filter } = response.awaitMessageComponent.mock.calls[0][0];
    expect(
      filter({ customId: 'deleteThemeConfirm-inv-1', user: { id: 'admin-1' } }),
    ).toBe(true);
    expect(
      filter({
        customId: 'deleteThemeConfirm-inv-1',
        user: { id: 'someone-else' },
      }),
    ).toBe(false);
  });

  // Each run gets its own button ids, so a click meant for one confirmation
  // cannot complete another.
  it('ignores a click on the buttons of another invocation', async () => {
    const { interaction, response } = invocation(1, null);

    await run(interaction);

    const { filter } = response.awaitMessageComponent.mock.calls[0][0];
    expect(
      filter({ customId: 'deleteThemeConfirm-inv-2', user: { id: 'admin-1' } }),
    ).toBe(false);
  });
});
