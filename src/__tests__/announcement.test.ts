import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction, Client } from 'discord.js';
import type { Config, ThemeEntry } from '../types';

// Partial mocks: rotate-now pulls in the command router, which loads modules
// that read other exports from these two at import time.
vi.mock('../state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../state')>()),
  getState: vi.fn(() => ({ currentIndex: 0 })),
  setStateIndex: vi.fn(),
}));
vi.mock('../themes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../themes')>()),
  getThemes: vi.fn(),
}));

import { getState } from '../state';
import { getThemes } from '../themes';
import { composeAnnouncement } from '../announcement';
import {
  MAX_THEME_MESSAGE,
  MAX_THEME_NAME,
  validateThemeMessage,
  validateThemeName,
} from '../theme-validation';
import { makeScheduledRotation } from '../scheduled-rotation';
import { rotateNow } from '../commands/rotate-now';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ─── what the post looks like ─────────────────────────────────────────────────

// The weekly post used to be the message alone. The channel is renamed again a
// week later, so anyone scrolling back found a description with nothing saying
// which theme it belonged to.
describe('the announcement leads with the theme name as a heading', () => {
  it('puts the name on the first line as a # heading and the message under it', () => {
    expect(
      composeAnnouncement(
        'Weekly theme pottery',
        'Show us what you threw this week',
      ),
    ).toBe('# Weekly theme pottery\nShow us what you threw this week');
  });

  // One name everywhere: the heading must match what /theme-bot themes, the
  // autocomplete suggestions and the reorder list show.
  it('uses the name exactly as stored, with no recasing or prefix stripping', () => {
    expect(composeAnnouncement('weekly THEME Jazz night', 'm')).toBe(
      '# weekly THEME Jazz night\nm',
    );
  });

  it('leaves markdown in a name as typed rather than escaping it', () => {
    expect(composeAnnouncement('Weekly theme *stars*', 'm')).toBe(
      '# Weekly theme *stars*\nm',
    );
  });

  it('keeps the message byte for byte, including its own breaks and markdown', () => {
    expect(
      composeAnnouncement(
        'Weekly theme jazz',
        '**Bold** opener\n\n> a quote\nlast line ',
      ),
    ).toBe('# Weekly theme jazz\n**Bold** opener\n\n> a quote\nlast line ');
  });
});

// ─── the budget ───────────────────────────────────────────────────────────────

// Discord refuses a message over 2000 characters, and rotateTheme logs that and
// carries on, so an oversized announcement silently never appears. The message
// cap used to be the post cap because the post was the message. With a heading
// in front they differ by exactly the heading:
//
//   "# "  2
//   name  95 at most
//   "\n"  1
//   ----
//         98, leaving 1902 for the message.
//
// These use the longest values the write path accepts, never short fixtures. A
// guard tested only with short inputs passes whatever the cap is.
describe('a composed announcement always fits in one Discord message', () => {
  it('accepts a 1902 character message at the write path', () => {
    expect(validateThemeMessage('m'.repeat(1902))).toHaveLength(1902);
  });

  it('refuses a 1903 character message at the write path', () => {
    expect(() => validateThemeMessage('m'.repeat(1903))).toThrow(
      /1902 characters/,
    );
  });

  // Exactly, not at most: at most would also pass a cap set lower than it needs
  // to be, which takes room from community writing for nothing.
  it('composes the longest legal name over the longest legal message to exactly 2000 characters', () => {
    const name = validateThemeName('n'.repeat(MAX_THEME_NAME));
    const message = validateThemeMessage('m'.repeat(MAX_THEME_MESSAGE));

    expect(composeAnnouncement(name, message)).toHaveLength(2000);
  });
});

// ─── one composition, two paths ───────────────────────────────────────────────

// The weekly cron and /theme-bot rotate-now must post the same thing for the
// same theme. Both are driven for real here, down to the channel.send call,
// rather than trusting that they share code today.
describe('the scheduled rotation and rotate-now post the same announcement', () => {
  const themes: ThemeEntry[] = [
    { name: 'Weekly theme origami', message: 'Fold something' },
    {
      name: 'Weekly theme pottery',
      message: 'Show us what you threw this week',
    },
  ];
  const expected = '# Weekly theme pottery\nShow us what you threw this week';

  // No adminChannelId, so the scheduled path's success notice has nowhere to
  // go and the only send is the announcement.
  const config: Config = { channelId: 'theme-channel' };

  // The channel must start under a different name from the theme being
  // applied. rotateTheme skips both the rename and the post when the name
  // already matches.
  function makeChannel() {
    const channel = {
      name: 'weekly-theme-origami',
      setName: vi.fn(async (name: string) => {
        channel.name = name;
      }),
      send: vi.fn().mockResolvedValue(undefined),
    };
    return channel;
  }

  function makeClient(channel: ReturnType<typeof makeChannel>) {
    return {
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
    } as unknown as Client;
  }

  function makeAdminInteraction() {
    return {
      inGuild: () => true,
      memberPermissions: { has: () => true },
      reply: vi.fn().mockResolvedValue(undefined),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };
  }

  async function postedByScheduled(): Promise<unknown[][]> {
    const channel = makeChannel();
    await makeScheduledRotation(makeClient(channel), () => config)();
    return channel.send.mock.calls;
  }

  async function postedByRotateNow(): Promise<unknown[][]> {
    const channel = makeChannel();
    await rotateNow(
      makeAdminInteraction() as unknown as ChatInputCommandInteraction,
      { client: makeClient(channel), config },
    );
    return channel.send.mock.calls;
  }

  beforeEach(() => {
    vi.mocked(getThemes).mockResolvedValue(themes);
    // Both runs start from the same position, so both apply the same theme.
    vi.mocked(getState).mockReturnValue({ currentIndex: 0 });
  });

  it('posts the heading and message once from the scheduled rotation', async () => {
    expect(await postedByScheduled()).toEqual([[expected]]);
  });

  it('posts the heading and message once from rotate-now', async () => {
    expect(await postedByRotateNow()).toEqual([[expected]]);
  });

  it('posts identical content from both paths for the same theme', async () => {
    const scheduled = await postedByScheduled();
    const manual = await postedByRotateNow();

    expect(manual).toEqual(scheduled);
  });
});
