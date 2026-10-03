import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ThemeEntry } from '../types';

/**
 * Reordering never moves the rotation position.
 *
 * applyMove writes the reordered list back around the current index, and
 * position 1 cannot be moved into or out of, so the current theme always keeps
 * its file index. reorder-themes also looked the current theme up again by name
 * after each move and saved the index it found. With the invariant that step
 * could only ever find the same index, except when an earlier entry shares the
 * current theme's name: findIndex returns the first copy, and the step wrote
 * that copy's index to state.json, on disk only. The next restart would then
 * load it and jump the rotation.
 *
 * The real state module runs here, with only the file system mocked. The
 * reorder flow tests used to mock saveState as if it also updated getState,
 * which the real one never did, so they could not see a disk-only write.
 */

let store: ThemeEntry[] = [];

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../themes', () => ({
  getThemes: vi.fn(async () => store),
  saveThemes: vi.fn(async (themes: ThemeEntry[]) => {
    store = themes;
  }),
  THEMES_PATH: '/tmp/test-themes.json',
}));

import fsp from 'fs/promises';
import { getState, setStateIndex, STATE_PATH } from '../state';
import { reorderThemesCmd } from '../commands/reorder-themes';
import { applyMove } from '../commands/reorder-view';

const settle = async () => {
  for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
};
const pending = () => new Promise(() => {});

const list = (n: number): ThemeEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Fixture ${i + 1}`,
    message: `Message ${i + 1}`,
  }));

const nameAt = (i: number) => (store[i] as { name: string }).name;

/** One move through the real handler, as the two numbers typed into the form. */
async function move(from: string, to: string) {
  let clicked = false;
  const button = {
    customId: 'reorderMove-inv-1',
    user: { id: 'user-1' },
    update: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
  const response = {
    awaitMessageComponent: vi.fn(() => {
      if (clicked) return pending();
      clicked = true;
      return Promise.resolve(button);
    }),
  };
  const interaction = {
    id: 'inv-1',
    user: { id: 'user-1' },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(response),
    awaitModalSubmit: vi.fn(() =>
      Promise.resolve({
        customId: 'reorderMoveModal-inv-1',
        user: { id: 'user-1' },
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        fields: {
          getTextInputValue: (key: string) =>
            key === 'fromPosition' ? from : to,
        },
      }),
    ),
  };

  void reorderThemesCmd(
    interaction as unknown as ChatInputCommandInteraction,
    {} as never,
  );
  await settle();

  return interaction.editReply.mock.calls.map(
    (call) => (call[0] as { content: string }).content,
  );
}

function seed(themes: ThemeEntry[]) {
  store = themes;
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  seed(list(6));
  // Fixture 4 is current. The list shows it at position 1, then 5, 6, 1, 2, 3.
  await setStateIndex(3);
  vi.mocked(fsp.writeFile).mockClear();
});

/** Every index written to state.json since the test began. */
function stateWrites(): number[] {
  return vi
    .mocked(fsp.writeFile)
    .mock.calls.filter(([path]) => path === `${STATE_PATH}.tmp`)
    .map(([, body]) => JSON.parse(body as string).currentIndex);
}

describe('applyMove keeps the current theme at the current index', () => {
  // Every legal move on a six theme list, with the current theme mid-file so
  // moves cross the end of the list.
  it('for every legal move', () => {
    const themes = list(6);
    for (let from = 1; from < 6; from++) {
      for (let to = 1; to < 6; to++) {
        if (from === to) continue;
        const moved = applyMove(themes, 3, from, to);
        expect((moved[3] as { name: string }).name).toBe('Fixture 4');
      }
    }
  });
});

describe('a reorder leaves the rotation position alone', () => {
  // Fixture 2 sits before the current theme in the file; moving it to just
  // after the current theme crosses the end of the list.
  it('keeps the position on the current theme', async () => {
    await move('5', '2');

    expect(getState().currentIndex).toBe(3);
    expect(nameAt(3)).toBe('Fixture 4');
  });

  it('does not rewrite state.json', async () => {
    await move('5', '2');

    expect(stateWrites()).toEqual([]);
  });

  it('redraws the list with the current theme still at position 1', async () => {
    const renders = await move('5', '2');

    const redrawn = renders.at(-1)!;
    expect(redrawn).toMatch(/^1\. .*Fixture 4/m);
    expect(redrawn).toMatch(/^2\. .*Fixture 2/m);
  });

  // The August shape: an earlier entry shares the current theme's name. Only
  // a hand edit can store one now, and the reload audit reports it, but the
  // rotation still has to survive it.
  it('does not move the saved position to an earlier copy of the current name', async () => {
    seed([
      { name: 'Fixture 1', message: 'm' },
      { name: 'Fixture 4', message: 'earlier copy' },
      { name: 'Fixture 3', message: 'm' },
      { name: 'Fixture 4', message: 'current' },
      { name: 'Fixture 5', message: 'm' },
      { name: 'Fixture 6', message: 'm' },
    ]);

    await move('3', '2');

    expect(stateWrites()).toEqual([]);
    expect(getState().currentIndex).toBe(3);
  });
});
