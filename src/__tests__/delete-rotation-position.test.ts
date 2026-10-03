import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ThemeEntry } from '../types';

/**
 * Deleting a theme must not move the rotation.
 *
 * The rotation position is the index of the theme that is live this week, and
 * the next rotation applies the one after it. Removing an entry shifts every
 * index after it, so the position has to follow. The real store and the real
 * state module run here, with only the file system mocked.
 */

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  },
}));

import fsp from 'fs/promises';
import { getThemes, reloadThemes } from '../themes';
import { getState, setStateIndex, STATE_PATH } from '../state';
import { encodeThemeChoice } from '../commands/theme-autocomplete';
import { deleteThemeCmd } from '../commands/delete-theme';

const FIVE = ['A', 'B', 'C', 'D', 'E'].map((letter) => ({
  name: `Weekly theme ${letter}`,
  message: 'm',
}));

async function seed(themes: ThemeEntry[], currentIndex: number) {
  vi.mocked(fsp.readFile).mockResolvedValue(
    JSON.stringify({ themes }) as never,
  );
  await reloadThemes();
  await setStateIndex(currentIndex);
  vi.mocked(fsp.writeFile).mockClear();
}

/** Confirms a delete of the given position through the real command. */
async function deleteAt(index: number) {
  const themes = await getThemes();
  const button = {
    customId: 'deleteThemeConfirm-inv-1',
    user: { id: 'admin-1' },
    update: vi.fn().mockResolvedValue(undefined),
  };
  await deleteThemeCmd(
    {
      id: 'inv-1',
      user: { id: 'admin-1' },
      inGuild: () => true,
      memberPermissions: { has: () => true },
      options: {
        getString: () => encodeThemeChoice(index, themes[index]),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue({
        awaitMessageComponent: () => Promise.resolve(button),
      }),
    } as unknown as ChatInputCommandInteraction,
    {} as never,
  );
}

async function nameAt(index: number): Promise<string> {
  const themes = await getThemes();
  return (themes[index] as { name: string }).name;
}

/** What /theme-bot themes would mark current, and what rotates in next. */
async function currentAndNext() {
  const themes = await getThemes();
  const index = getState().currentIndex;
  return {
    current: await nameAt(index),
    next: await nameAt((index + 1) % themes.length),
  };
}

function savedIndex(): number | undefined {
  const writes = vi
    .mocked(fsp.writeFile)
    .mock.calls.filter(([path]) => path === `${STATE_PATH}.tmp`);
  const last = writes.at(-1);
  return last ? JSON.parse(last[1] as string).currentIndex : undefined;
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // C is live this week, so D rotates in next.
  await seed(FIVE, 2);
});

describe('deleting a theme other than the current one', () => {
  it('keeps the current theme current when an earlier one is deleted', async () => {
    await deleteAt(0);

    expect(await currentAndNext()).toEqual({
      current: 'Weekly theme C',
      next: 'Weekly theme D',
    });
  });

  it('writes the moved position to state.json too', async () => {
    await deleteAt(0);

    expect(savedIndex()).toBe(getState().currentIndex);
  });

  it('changes nothing when a later one is deleted', async () => {
    await deleteAt(4);

    expect(getState().currentIndex).toBe(2);
    expect(await currentAndNext()).toEqual({
      current: 'Weekly theme C',
      next: 'Weekly theme D',
    });
  });
});

// The live theme is gone, so nothing can be marked current, but the queue
// must carry on from where it was: the theme that was next is still next.
describe('deleting the current theme', () => {
  it('keeps the theme that was next as the next to rotate in', async () => {
    await deleteAt(2);

    expect((await currentAndNext()).next).toBe('Weekly theme D');
  });

  it('keeps the next theme next when the current theme was first', async () => {
    await seed(FIVE, 0);

    await deleteAt(0);

    expect((await currentAndNext()).next).toBe('Weekly theme B');
  });

  it('wraps to the first theme when the current theme was last', async () => {
    await seed(FIVE, 4);

    await deleteAt(4);

    expect((await currentAndNext()).next).toBe('Weekly theme A');
  });
});

describe('deleting the only theme', () => {
  it('leaves a usable position for the next theme added', async () => {
    await seed([FIVE[0]], 0);

    await deleteAt(0);

    expect(getState().currentIndex).toBe(0);
  });
});
