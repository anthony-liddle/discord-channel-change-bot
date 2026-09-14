import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

// THEMES_PATH is re-exported through runtime-files.ts via commands/index.ts,
// so the mock has to provide it or the module graph fails to load.
vi.mock('../themes', () => ({
  getThemes: vi.fn(),
  updateTheme: vi.fn(),
  THEMES_PATH: '/tmp/test-themes.json',
}));

import { getThemes, updateTheme } from '../themes';
import { editThemeCmd } from '../commands/edit-theme';
import { MAX_THEME_MESSAGE, MAX_THEME_NAME } from '../theme-validation';

// awaitModalSubmit builds an InteractionCollector with no message, channel or
// guild, so it listens client-wide and filters only on interaction type plus
// the caller's filter. Every live collector therefore sees every modal submit.
// This registry reproduces that: submitModal offers the interaction to all of
// them, and each decides for itself whether to take it.
interface Collector {
  filter: (i: unknown) => boolean;
  resolve: (i: unknown) => void;
}
let collectors: Collector[] = [];

function submitModal(modal: unknown): number {
  let taken = 0;
  for (const c of [...collectors]) {
    if (c.filter(modal)) {
      taken++;
      c.resolve(modal);
    }
  }
  return taken;
}

const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};

const themes = [
  { name: 'Weekly theme animal style', message: 'a' },
  { name: 'Weekly theme nipples', message: 'b' },
  { name: 'Weekly theme senses', message: 'c' },
  { name: 'Weekly theme silly and playful', message: 'd' },
  { name: 'Weekly theme food play', message: 'e' },
  { name: 'Weekly theme bondage', message: 'f' },
];

const USER = 'user-1';

function makeInvocation(id: string) {
  const select = {
    values: ['0'],
    user: { id: USER },
    customId: '',
    showModal: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const response = {
    awaitMessageComponent: vi.fn().mockResolvedValue(select),
  };
  const interaction = {
    id,
    user: { id: USER },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(response),
    followUp: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    awaitModalSubmit: vi.fn(
      ({ filter }: { filter: (i: unknown) => boolean }) =>
        new Promise((resolve) => collectors.push({ filter, resolve })),
    ),
  };
  return { interaction, select, response };
}

function modalCustomIdFrom(select: { showModal: ReturnType<typeof vi.fn> }) {
  const modal = select.showModal.mock.calls[0][0];
  return modal.toJSON().custom_id as string;
}

function makeModalSubmit(customId: string, name: string, message: string) {
  return {
    customId,
    user: { id: USER },
    fields: {
      getTextInputValue: (k: string) => (k === 'themeName' ? name : message),
    },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

function modalInputs(select: { showModal: ReturnType<typeof vi.fn> }) {
  const json = select.showModal.mock.calls[0][0].toJSON();
  const inputs: Record<string, { max_length?: number }> = {};
  for (const label of json.components) {
    inputs[label.component.custom_id] = label.component;
  }
  return inputs;
}

beforeEach(() => {
  collectors = [];
  vi.mocked(getThemes).mockResolvedValue(themes);
  vi.mocked(updateTheme).mockResolvedValue(undefined);
});

// The prefill now slices before setValue, so it would throw on a non-string.
// themeNameText and themeMessageText coerce first, which is what keeps this
// safe, and this pins that rather than trusting it. A throw here lands after
// the defer but before showModal, so the admin gets a modal that never opens.
describe('edit-theme prefill survives a malformed stored entry', () => {
  const malformed = [
    { name: null, message: null },
    { name: 7, message: undefined },
    'legacy string theme',
    { name: 'x'.repeat(150), message: 'y'.repeat(9000) },
    null,
  ] as unknown as typeof themes;

  for (let index = 0; index < malformed.length; index++) {
    it(`opens the modal for malformed entry ${index + 1} instead of throwing`, async () => {
      vi.mocked(getThemes).mockResolvedValue(malformed);
      const a = makeInvocation('inv-A');
      a.select.values = [String(index)];

      void editThemeCmd(
        a.interaction as unknown as ChatInputCommandInteraction,
        {} as never,
      );
      await settle();

      expect(a.select.showModal).toHaveBeenCalled();
      expect(() => a.select.showModal.mock.calls[0][0].toJSON()).not.toThrow();
    });
  }
});

describe('edit-theme modal input limits', () => {
  it('caps the theme name in the modal itself', async () => {
    const a = makeInvocation('inv-A');
    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    expect(modalInputs(a.select).themeName.max_length).toBe(MAX_THEME_NAME);
  });

  it('caps the channel message in the modal itself', async () => {
    const a = makeInvocation('inv-A');
    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    expect(modalInputs(a.select).channelMessage.max_length).toBe(
      MAX_THEME_MESSAGE,
    );
  });
});

describe('edit-theme echoes the resulting channel name', () => {
  it('shows the channel name the edited theme will produce', async () => {
    const a = makeInvocation('inv-A');
    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    const submit = makeModalSubmit(
      modalCustomIdFrom(a.select),
      'Weekly Theme Toys',
      'msg',
    );
    submitModal(submit);
    await settle();

    expect(submit.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('weekly-theme-toys'),
      }),
    );
  });
});

describe('edit-theme modal scoping', () => {
  it('gives each invocation a distinct modal customId', async () => {
    const a = makeInvocation('inv-A');
    const b = makeInvocation('inv-B');
    a.select.values = ['2'];
    b.select.values = ['5'];

    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();
    void editThemeCmd(
      b.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    const idA = modalCustomIdFrom(a.select);
    const idB = modalCustomIdFrom(b.select);
    expect(idA).not.toBe(idB);
  });

  it('keeps the modal customId within the 100 character limit', async () => {
    const a = makeInvocation('1544089725831217182');
    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();
    expect(modalCustomIdFrom(a.select).length).toBeLessThanOrEqual(100);
  });

  it('routes a modal submit to the invocation that opened it, and only that one', async () => {
    const a = makeInvocation('inv-A');
    const b = makeInvocation('inv-B');
    a.select.values = ['2'];
    b.select.values = ['5'];

    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();
    void editThemeCmd(
      b.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    // Both collectors are live. A was abandoned; only B's modal is submitted.
    const takenBy = submitModal(
      makeModalSubmit(modalCustomIdFrom(b.select), 'B name', 'B message'),
    );
    await settle();

    expect(takenBy).toBe(1);
    expect(updateTheme).toHaveBeenCalledTimes(1);
    expect(updateTheme).toHaveBeenCalledWith(5, 'B name', 'B message');
  });

  it('never writes the index resolved by a different invocation', async () => {
    const a = makeInvocation('inv-A');
    const b = makeInvocation('inv-B');
    a.select.values = ['2'];
    b.select.values = ['5'];

    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();
    void editThemeCmd(
      b.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    submitModal(
      makeModalSubmit(modalCustomIdFrom(b.select), 'B name', 'B msg'),
    );
    await settle();

    const indexesWritten = vi.mocked(updateTheme).mock.calls.map((c) => c[0]);
    expect(indexesWritten).toEqual([5]);
    expect(indexesWritten).not.toContain(2);
  });

  it('still rejects a modal submitted by a different user', async () => {
    const a = makeInvocation('inv-A');
    a.select.values = ['3'];
    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    const foreign = makeModalSubmit(modalCustomIdFrom(a.select), 'x', 'y');
    foreign.user = { id: 'someone-else' };
    expect(submitModal(foreign)).toBe(0);
    await settle();
    expect(updateTheme).not.toHaveBeenCalled();
  });
});

describe('edit-theme picker teardown', () => {
  it('clears the components once the modal has been shown', async () => {
    const a = makeInvocation('inv-A');
    a.select.values = ['2'];
    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    expect(a.select.showModal).toHaveBeenCalled();
    const cleared = a.interaction.editReply.mock.calls.filter(
      (c) => Array.isArray(c[0]?.components) && c[0].components.length === 0,
    );
    expect(cleared.length).toBeGreaterThan(0);
  });

  it('names the entry being edited in the replacement content', async () => {
    const a = makeInvocation('inv-A');
    a.select.values = ['2'];
    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    const cleared = a.interaction.editReply.mock.calls
      .map((c) => c[0])
      .filter((p) => Array.isArray(p?.components) && p.components.length === 0);
    const text = cleared.map((p) => p.content).join('\n');
    expect(text).toContain('Weekly theme senses');
  });

  it('tells the admin to run the command again for a different theme', async () => {
    const a = makeInvocation('inv-A');
    a.select.values = ['2'];
    void editThemeCmd(
      a.interaction as unknown as ChatInputCommandInteraction,
      {} as never,
    );
    await settle();

    const text = a.interaction.editReply.mock.calls
      .map((c) => c[0])
      .filter((p) => Array.isArray(p?.components) && p.components.length === 0)
      .map((p) => p.content)
      .join('\n');
    expect(text).toMatch(/again/i);
  });
});
