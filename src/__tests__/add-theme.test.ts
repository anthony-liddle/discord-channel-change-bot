import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

vi.mock('../themes', () => ({
  addTheme: vi.fn(),
  THEMES_PATH: '/tmp/test-themes.json',
}));

import { addTheme } from '../themes';
import { addThemeCmd } from '../commands/add-theme';

// Same client-wide collector behaviour as edit-theme. Every live modal
// collector is offered every submit and decides for itself whether to take it.
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

const USER = 'user-1';

function makeInvocation(id: string) {
  return {
    id,
    user: { id: USER },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    showModal: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    awaitModalSubmit: vi.fn(
      ({ filter }: { filter: (i: unknown) => boolean }) =>
        new Promise((resolve) => collectors.push({ filter, resolve })),
    ),
  };
}

function modalCustomIdFrom(i: { showModal: ReturnType<typeof vi.fn> }) {
  return i.showModal.mock.calls[0][0].toJSON().custom_id as string;
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

beforeEach(() => {
  collectors = [];
  vi.mocked(addTheme).mockResolvedValue(undefined);
});

describe('add-theme modal scoping', () => {
  it('gives each invocation a distinct modal customId', async () => {
    const a = makeInvocation('inv-A');
    const b = makeInvocation('inv-B');
    void addThemeCmd(a as unknown as ChatInputCommandInteraction, {} as never);
    await settle();
    void addThemeCmd(b as unknown as ChatInputCommandInteraction, {} as never);
    await settle();

    expect(modalCustomIdFrom(a)).not.toBe(modalCustomIdFrom(b));
  });

  it('keeps the modal customId within the 100 character limit', async () => {
    const a = makeInvocation('1544089725831217182');
    void addThemeCmd(a as unknown as ChatInputCommandInteraction, {} as never);
    await settle();
    expect(modalCustomIdFrom(a).length).toBeLessThanOrEqual(100);
  });

  // This is the shape that most plausibly created the duplicate that broke
  // edit-theme in the first place: run, abandon, run again, submit once.
  it('adds the theme exactly once when an earlier invocation is still waiting', async () => {
    const a = makeInvocation('inv-A');
    const b = makeInvocation('inv-B');
    void addThemeCmd(a as unknown as ChatInputCommandInteraction, {} as never);
    await settle();
    void addThemeCmd(b as unknown as ChatInputCommandInteraction, {} as never);
    await settle();

    const taken = submitModal(
      makeModalSubmit(modalCustomIdFrom(b), 'Thicc and Thirsty', 'msg'),
    );
    await settle();

    expect(taken).toBe(1);
    expect(addTheme).toHaveBeenCalledTimes(1);
    expect(addTheme).toHaveBeenCalledWith('Thicc and Thirsty', 'msg');
  });

  it('rejects a modal submitted by a different user', async () => {
    const a = makeInvocation('inv-A');
    void addThemeCmd(a as unknown as ChatInputCommandInteraction, {} as never);
    await settle();

    const foreign = makeModalSubmit(modalCustomIdFrom(a), 'x', 'y');
    foreign.user = { id: 'someone-else' };
    expect(submitModal(foreign)).toBe(0);
    await settle();
    expect(addTheme).not.toHaveBeenCalled();
  });
});
