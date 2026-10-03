import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction, Client } from 'discord.js';
import type { Config, ThemeEntry } from '../types';

// State that really advances, so the reply is checked against the index the
// real rotateTheme saves rather than against a fixed number.
let currentIndex = 0;
vi.mock('../state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../state')>()),
  getState: vi.fn(() => ({ currentIndex })),
  setStateIndex: vi.fn(async (index: number) => {
    currentIndex = index;
  }),
}));
vi.mock('../themes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../themes')>()),
  getThemes: vi.fn(),
}));

import { getThemes } from '../themes';
import { rotateNow } from '../commands/rotate-now';

const themes: ThemeEntry[] = [
  { name: 'Weekly theme origami', message: 'Fold something.' },
  { name: 'Weekly theme pottery', message: 'Show us.' },
  { name: 'Weekly theme jazz', message: 'Play something.' },
];
const config: Config = { channelId: 'theme-channel' };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getThemes).mockResolvedValue(themes);
  currentIndex = 0;
});

async function replyAfterRotating(): Promise<string> {
  const channel = {
    name: 'weekly-theme-origami',
    setName: vi.fn(async (name: string) => {
      channel.name = name;
    }),
    send: vi.fn().mockResolvedValue(undefined),
  };
  const editReply = vi.fn().mockResolvedValue(undefined);
  await rotateNow(
    {
      inGuild: () => true,
      memberPermissions: { has: () => true },
      reply: vi.fn(),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply,
    } as unknown as ChatInputCommandInteraction,
    {
      client: {
        channels: { fetch: vi.fn().mockResolvedValue(channel) },
      } as unknown as Client,
      config,
    },
  );
  return editReply.mock.calls.at(-1)![0].content;
}

// Since 2026-03-23 rotateTheme saves the index of the theme it applied. The
// reply still subtracted one, from when the index meant the next theme, so it
// named the theme before the one that had just gone live.
describe('rotate-now names the theme it actually applied', () => {
  it('names the theme the channel was just renamed for', async () => {
    expect(await replyAfterRotating()).toBe(
      'Theme rotated! New theme: `Weekly theme pottery`',
    );
  });

  it('names the right theme when the rotation wraps to the start', async () => {
    currentIndex = 2;
    expect(await replyAfterRotating()).toBe(
      'Theme rotated! New theme: `Weekly theme origami`',
    );
  });
});
