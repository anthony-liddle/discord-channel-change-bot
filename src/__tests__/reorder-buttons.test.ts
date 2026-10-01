import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ThemeEntry } from '../types';

/**
 * The reorder session's other buttons and its failure paths. reorder-flow
 * covers moving; this covers paging, finishing, and every way a move can end
 * without one.
 */

let store: ThemeEntry[] = [];

vi.mock('../themes', () => ({
  getThemes: vi.fn(async () => store),
  saveThemes: vi.fn(async (themes: ThemeEntry[]) => {
    store = themes;
  }),
  THEMES_PATH: '/tmp/test-themes.json',
}));
vi.mock('../state', () => ({
  getState: vi.fn(() => ({ currentIndex: 0 })),
  STATE_PATH: '/tmp/test-state.json',
}));

import { saveThemes } from '../themes';
import { reorderThemesCmd } from '../commands/reorder-themes';

const settle = async () => {
  for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
};

const list = (n: number, nameLength = 20): ThemeEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Fixture ${i + 1} `.padEnd(nameLength, 'x'),
    message: 'm',
  }));

type Step = 'move' | 'done' | 'next' | 'prev' | 'timeout';

/**
 * Runs the session through a script of button presses. A move submits the
 * given form values, or times out if the values are null.
 */
async function session(
  steps: Step[],
  form: [string, string] | null = ['3', '2'],
) {
  const ids: Record<Exclude<Step, 'timeout'>, string> = {
    move: 'reorderMove-inv-1',
    done: 'reorderDone-inv-1',
    next: 'reorderNext-inv-1',
    prev: 'reorderPrev-inv-1',
  };
  const buttons: { update: ReturnType<typeof vi.fn> }[] = [];
  let step = 0;

  const response = {
    awaitMessageComponent: vi.fn(() => {
      const next = steps[step++];
      if (next === undefined) return new Promise(() => {});
      if (next === 'timeout') {
        return Promise.reject(new Error('Collector received no interactions'));
      }
      const button = {
        customId: ids[next],
        user: { id: 'user-1' },
        update: vi.fn().mockResolvedValue(undefined),
        showModal: vi.fn().mockResolvedValue(undefined),
      };
      buttons.push(button);
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
      form === null
        ? Promise.reject(new Error('Collector received no interactions'))
        : Promise.resolve({
            customId: 'reorderMoveModal-inv-1',
            user: { id: 'user-1' },
            deferUpdate: vi.fn().mockResolvedValue(undefined),
            fields: {
              getTextInputValue: (key: string) =>
                key === 'fromPosition' ? form[0] : form[1],
            },
          }),
    ),
  };

  void reorderThemesCmd(
    interaction as unknown as ChatInputCommandInteraction,
    {} as never,
  );
  await settle();

  type Payload = { content: string; components: unknown[] };
  const edits = interaction.editReply.mock.calls.map((c) => c[0] as Payload);
  const updates = buttons.map((b) =>
    b.update.mock.calls.map((c) => c[0] as Payload),
  );
  return { edits, updates, response };
}

beforeEach(() => {
  vi.clearAllMocks();
  store = list(6);
});

describe('finishing a session', () => {
  it('Done leaves the list on screen with the buttons removed', async () => {
    const { updates, response } = await session(['done']);

    const last = updates[0].at(-1)!;
    expect(last.components).toEqual([]);
    expect(last.content).toMatch(/^1\. .*Fixture 1/m);
    // Nothing is waited for after Done.
    expect(response.awaitMessageComponent).toHaveBeenCalledTimes(1);
  });

  it('times out to a plain message with no buttons', async () => {
    const { edits } = await session(['timeout']);

    expect(edits.at(-1)).toEqual({ content: 'Timed out.', components: [] });
  });
});

// A long list spans pages. Paging changes what is shown, never what can be
// moved, so it must not save anything.
describe('paging a long list', () => {
  beforeEach(() => {
    store = list(60, 95);
  });

  it('Next shows the second page', async () => {
    const { updates } = await session(['next']);

    expect(updates[0][0].content).toMatch(/\(page 2 of \d+\)/);
  });

  it('Prev comes back to the first page', async () => {
    const { updates } = await session(['next', 'prev']);

    expect(updates[1][0].content).toMatch(/\(page 1 of \d+\)/);
    expect(saveThemes).not.toHaveBeenCalled();
  });
});

describe('a move that does not happen', () => {
  it('says the form timed out, keeps the session open, and saves nothing', async () => {
    const { edits, response } = await session(['move'], null);

    expect(edits.at(-1)!.content).toContain(
      'That move form timed out. Press Move to try again.',
    );
    expect(edits.at(-1)!.components).not.toEqual([]);
    expect(response.awaitMessageComponent).toHaveBeenCalledTimes(2);
    expect(saveThemes).not.toHaveBeenCalled();
  });

  it('says the save failed, with the reason, and leaves the list as it was', async () => {
    vi.mocked(saveThemes).mockRejectedValueOnce(new Error('disk full'));

    const { edits } = await session(['move'], ['3', '2']);

    const last = edits.at(-1)!.content;
    expect(last).toContain('Failed to save the new order.\n> disk full');
    expect(last).toMatch(/^2\. .*Fixture 2/m);
    expect(last).toMatch(/^3\. .*Fixture 3/m);
  });
});
