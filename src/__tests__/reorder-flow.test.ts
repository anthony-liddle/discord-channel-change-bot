import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ThemeEntry } from '../types';

/**
 * The reorder move loop, end to end: button, modal, save, re-render.
 *
 * Every other part of reorder is covered in isolation. applyMove and
 * buildReorderPages have their own tests, and theme-count-boundaries covers the
 * first render. Nothing covered the loop that stitches them together, which is
 * the path an admin actually uses, repeatedly, in one sitting.
 *
 * The thing that has to hold: after a move lands, the list on screen is rebuilt
 * from what was just saved rather than patched in place. If it were patched,
 * the positions an admin reads for their next move would be stale and they
 * would move the wrong theme.
 *
 * Neutral fixture names.
 */

/** The saved theme list, so a re-render reads back what a save wrote. */
let store: ThemeEntry[] = [];
/** Rotation position, so following the current theme by name is exercised. */
let currentIndex = 0;

vi.mock('../themes', () => ({
  getThemes: vi.fn(async () => store),
  saveThemes: vi.fn(async (themes: ThemeEntry[]) => {
    store = themes;
  }),
  THEMES_PATH: '/tmp/test-themes.json',
}));

vi.mock('../state', () => ({
  getState: vi.fn(() => ({ currentIndex })),
  saveState: vi.fn(async (state: { currentIndex: number }) => {
    currentIndex = state.currentIndex;
  }),
  STATE_PATH: '/tmp/test-state.json',
}));

import { saveThemes } from '../themes';
import { reorderThemesCmd, buildRotatedView } from '../commands/reorder-themes';
import { buildReorderPages } from '../commands/reorder-view';

const settle = async () => {
  for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
};
const pending = () => new Promise(() => {});

const list = (n: number): ThemeEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Fixture ${i + 1}`,
    message: `Message ${i + 1}`,
  }));

const nameAt = (themes: ThemeEntry[], i: number) =>
  (themes[i] as { name: string }).name;

/**
 * Drives the handler through a sequence of moves, each given as the two values
 * an admin would type into the move form.
 */
async function runMoves(
  themes: ThemeEntry[],
  moves: [string, string][],
  /** Runs while the move form is open, to simulate the list moving underneath. */
  beforeSubmit?: () => void,
) {
  store = themes;
  currentIndex = 0;

  let clicks = 0;
  let submits = 0;

  const button = {
    customId: 'reorderMove-inv-1',
    user: { id: 'user-1' },
    update: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };

  const response = {
    awaitMessageComponent: vi.fn(() =>
      clicks++ < moves.length ? Promise.resolve(button) : pending(),
    ),
  };

  const interaction = {
    id: 'inv-1',
    user: { id: 'user-1' },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(response),
    awaitModalSubmit: vi.fn(() => {
      const [from, to] = moves[submits++];
      beforeSubmit?.();
      return Promise.resolve({
        customId: 'reorderMoveModal-inv-1',
        user: { id: 'user-1' },
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        fields: {
          getTextInputValue: (key: string) =>
            key === 'fromPosition' ? from : to,
        },
      });
    }),
  };

  void reorderThemesCmd(
    interaction as unknown as ChatInputCommandInteraction,
    {} as never,
  );
  await settle();

  const renders = interaction.editReply.mock.calls.map(
    (call) => (call[0] as { content: string }).content,
  );

  return { renders, button, interaction };
}

const lineAt = (render: string, position: number) =>
  render.split('\n').find((l) => l.startsWith(`${position}. `)) ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  store = [];
  currentIndex = 0;
});

describe('a move renumbers the list the admin is looking at', () => {
  it('re-renders after the move rather than leaving the first list on screen', async () => {
    const { renders } = await runMoves(list(30), [['27', '3']]);
    expect(renders.length).toBeGreaterThan(1);
  });

  it('puts the moved theme at its new position', async () => {
    const { renders } = await runMoves(list(30), [['27', '3']]);
    expect(lineAt(renders.at(-1)!, 3)).toContain('Fixture 27');
  });

  it('shifts everything between the two positions down by one', async () => {
    const { renders } = await runMoves(list(30), [['27', '3']]);
    const after = renders.at(-1)!;

    expect(lineAt(after, 4)).toContain('Fixture 3');
    expect(lineAt(after, 5)).toContain('Fixture 4');
    expect(lineAt(after, 27)).toContain('Fixture 26');
  });

  it('leaves positions outside the moved range alone', async () => {
    const { renders } = await runMoves(list(30), [['27', '3']]);
    const after = renders.at(-1)!;

    expect(lineAt(after, 1)).toContain('Fixture 1');
    expect(lineAt(after, 2)).toContain('Fixture 2');
    expect(lineAt(after, 28)).toContain('Fixture 28');
    expect(lineAt(after, 30)).toContain('Fixture 30');
  });

  it('tells the admin what just moved', async () => {
    const { renders } = await runMoves(list(30), [['27', '3']]);
    expect(renders.at(-1)).toContain('Moved theme 27 to position 3');
  });
});

describe('every position is still present after a move', () => {
  for (const count of [24, 25, 26, 200]) {
    it(`reorder-themes at ${count} themes lists all ${count} positions after a move`, async () => {
      await runMoves(list(count), [[String(count), '2']]);

      // A long list renders only the page holding the destination, so the
      // check is across every page of what was saved.
      const everyPage = buildReorderPages(
        buildRotatedView(store, currentIndex),
      ).join('\n');

      for (let position = 1; position <= count; position++) {
        expect(everyPage).toContain(`${position}. `);
      }
    });

    it(`reorder-themes at ${count} themes shows the page holding the destination`, async () => {
      const { renders } = await runMoves(list(count), [[String(count), '2']]);
      expect(renders.at(-1)).toContain('2. ');
    });

    it(`reorder-themes at ${count} themes keeps every theme after a move`, async () => {
      await runMoves(list(count), [[String(count), '2']]);

      expect(store).toHaveLength(count);
      expect(new Set(store.map((_, i) => nameAt(store, i))).size).toBe(count);
    });
  }
});

// The assertion that separates rebuilt from patched. A patched list could show
// the right theme in the right place while the rest of the numbering drifted;
// this compares the whole rendered page against a fresh render of what was
// actually saved, so only a genuine rebuild passes.
describe('the list is rebuilt from what was saved, not patched in place', () => {
  it('matches a fresh render of the saved list exactly', async () => {
    const { renders } = await runMoves(list(30), [['27', '3']]);

    const fresh = buildReorderPages(buildRotatedView(store, currentIndex))[0];
    expect(renders.at(-1)).toContain(fresh);
  });

  it('matches a fresh render after several moves in one sitting', async () => {
    const { renders } = await runMoves(list(30), [
      ['27', '3'],
      ['28', '5'],
      ['30', '1'],
    ]);

    const fresh = buildReorderPages(buildRotatedView(store, currentIndex))[0];
    expect(renders.at(-1)).toContain(fresh);
  });

  it('reads each move against the list the previous move produced', async () => {
    // Move 30 to 2, then move 2 to 5. The second move has to act on what the
    // first one put at position 2, not on what was there originally.
    const { renders } = await runMoves(list(30), [
      ['30', '2'],
      ['2', '5'],
    ]);
    const after = renders.at(-1)!;

    expect(lineAt(after, 5)).toContain('Fixture 30');
  });

  it('saves once per move rather than batching to the end', async () => {
    await runMoves(list(30), [
      ['27', '3'],
      ['28', '5'],
    ]);

    expect(vi.mocked(saveThemes).mock.calls).toHaveLength(2);
  });
});

describe('a move that cannot be applied changes nothing', () => {
  it('reports a position past the end and does not save', async () => {
    const { renders } = await runMoves(list(30), [['99', '3']]);

    expect(renders.at(-1)).toMatch(/no position 99/i);
    expect(saveThemes).not.toHaveBeenCalled();
  });

  it('still shows the list after refusing', async () => {
    const { renders } = await runMoves(list(30), [['99', '3']]);
    expect(renders.at(-1)).toContain('1. ');
  });

  it('refuses text that is not a position and does not save', async () => {
    const { renders } = await runMoves(list(30), [['seven', '3']]);

    expect(renders.at(-1)).toMatch(/not a position/i);
    expect(saveThemes).not.toHaveBeenCalled();
  });
});

// Position 2 is the soonest a move can take effect, because position 1 is the
// theme already applied to the channel this week and rotateTheme advances to
// currentIndex + 1.
describe('moving a theme to the front of the queue', () => {
  it('puts it at position 2, which is the next rotation', async () => {
    const { renders } = await runMoves(list(30), [['30', '2']]);
    expect(lineAt(renders.at(-1)!, 2)).toContain('Fixture 30');
  });

  it('does not change which theme is current', async () => {
    await runMoves(list(30), [['30', '2']]);
    expect(nameAt(store, currentIndex)).toBe('Fixture 1');
  });

  it('still marks the same theme as current in the list', async () => {
    const { renders } = await runMoves(list(30), [['30', '2']]);
    expect(lineAt(renders.at(-1)!, 1)).toContain('Fixture 1');
  });
});

// ─── the current rotation slot ────────────────────────────────────────────────

/**
 * Position 1 is the current rotation slot, and the view is pinned to it, so a
 * move into or out of it re-rotates back to where it started. Both directions
 * used to come back with an unchanged list and a notice saying the move
 * succeeded.
 */
describe('a move touching position 1 is refused rather than silently doing nothing', () => {
  for (const [label, move] of [
    ['out of position 1', ['1', '5']],
    ['into position 1', ['5', '1']],
  ] as [string, [string, string]][]) {
    it(`refuses a move ${label}`, async () => {
      const { renders } = await runMoves(list(30), [move]);
      expect(renders.at(-1)).toMatch(/current rotation slot/i);
    });

    it(`saves nothing for a move ${label}`, async () => {
      await runMoves(list(30), [move]);
      expect(saveThemes).not.toHaveBeenCalled();
    });

    it(`never claims a move ${label} succeeded`, async () => {
      const { renders } = await runMoves(list(30), [move]);
      expect(renders.at(-1)).not.toMatch(/Moved theme/);
    });

    it(`leaves the order untouched for a move ${label}`, async () => {
      await runMoves(list(30), [move]);
      expect(store.map((_, i) => nameAt(store, i))).toEqual(
        list(30).map((_, i) => `Fixture ${i + 1}`),
      );
    });
  }

  it('still shows the list after refusing', async () => {
    const { renders } = await runMoves(list(30), [['5', '1']]);
    expect(renders.at(-1)).toContain('1. ');
  });
});

// The form is open for as long as the admin takes to fill it in. A scheduled
// rotation can advance currentIndex in that window, and another session can
// add or remove a theme, so positions valid at parse time can be wrong by the
// time the write happens.
describe('a position that stopped being valid while the form was open', () => {
  it('refuses a source that is past the end of the list as it now stands', async () => {
    const { renders } = await runMoves(list(30), [['28', '4']], () => {
      store = store.slice(0, 10);
    });

    expect(renders.at(-1)).toMatch(/not in the list any more/i);
    expect(saveThemes).not.toHaveBeenCalled();
  });

  it('does not corrupt the list when the source went out of range', async () => {
    await runMoves(list(30), [['28', '4']], () => {
      store = store.slice(0, 10);
    });

    expect(store).toHaveLength(10);
    expect(store.every((entry) => entry !== undefined)).toBe(true);
  });

  it('applies a move that is still in range after the list shrank', async () => {
    const { renders } = await runMoves(list(30), [['8', '4']], () => {
      store = store.slice(0, 10);
    });

    expect(saveThemes).toHaveBeenCalledTimes(1);
    expect(renders.at(-1)).toContain('Moved theme 8 to position 4');
  });
});
