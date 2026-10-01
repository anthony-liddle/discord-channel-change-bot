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
import { validatePermissions } from '../rotation';
import { PermissionFlagsBits } from 'discord.js';

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

// ─── a theme with no message ──────────────────────────────────────────────────

// Decided: the heading posts on its own. A blank used to mean the channel was
// renamed and nothing was posted, which left a week with no trace in the
// channel's history. The name alone still says which theme ran when, and a
// blank that posts a bare heading is noticed the same week instead of never.
// Only a hand edit or a legacy string entry can produce one; both modals
// require a message.
describe('a theme with no message posts its heading alone', () => {
  it('posts the heading alone when the message is missing', () => {
    expect(composeAnnouncement('Weekly theme pottery', undefined)).toBe(
      '# Weekly theme pottery',
    );
  });

  it('posts the heading alone when the message is null', () => {
    expect(composeAnnouncement('Weekly theme pottery', null)).toBe(
      '# Weekly theme pottery',
    );
  });

  it('posts the heading alone when the message is empty', () => {
    expect(composeAnnouncement('Weekly theme pottery', '')).toBe(
      '# Weekly theme pottery',
    );
  });

  // Discord refuses a whitespace-only post outright, so today this case is a
  // send error in the log and nothing in the channel.
  it('posts the heading alone when the message is only whitespace', () => {
    expect(composeAnnouncement('Weekly theme pottery', '  \n\t ')).toBe(
      '# Weekly theme pottery',
    );
  });

  // A hand edit can put anything in the file. The reload audit reports it,
  // but the rotation still reaches it on the Monday it comes up.
  it('posts the heading alone when a hand edit left a message that is not text', () => {
    expect(
      composeAnnouncement('Weekly theme pottery', 42 as unknown as string),
    ).toBe('# Weekly theme pottery');
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

  // What reaches channel.send: the text, with every mention type switched off.
  const posted = (content: string) => ({
    content,
    allowedMentions: { parse: [] },
  });

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
    expect(await postedByScheduled()).toEqual([[posted(expected)]]);
  });

  it('posts the heading and message once from rotate-now', async () => {
    expect(await postedByRotateNow()).toEqual([[posted(expected)]]);
  });

  it('posts identical content from both paths for the same theme', async () => {
    const scheduled = await postedByScheduled();
    const manual = await postedByRotateNow();

    expect(manual).toEqual(scheduled);
  });

  describe('for a theme with no message', () => {
    const blank: ThemeEntry[] = [
      { name: 'Weekly theme origami', message: 'Fold something' },
      { name: 'Weekly theme pottery', message: '' },
    ];

    it('posts the heading alone from the scheduled rotation', async () => {
      vi.mocked(getThemes).mockResolvedValue(blank);
      expect(await postedByScheduled()).toEqual([
        [posted('# Weekly theme pottery')],
      ]);
    });

    it('posts the heading alone from rotate-now', async () => {
      vi.mocked(getThemes).mockResolvedValue(blank);
      expect(await postedByRotateNow()).toEqual([
        [posted('# Weekly theme pottery')],
      ]);
    });

    // The oldest data format: a bare string, which never had a message.
    it('posts the heading alone for a legacy string entry', async () => {
      vi.mocked(getThemes).mockResolvedValue([
        'Weekly theme origami',
        'Weekly theme pottery',
      ]);
      expect(await postedByScheduled()).toEqual([
        [posted('# Weekly theme pottery')],
      ]);
    });
  });

  // A name used to become only a channel slug, where @everyone is inert. In a
  // post it is not. Pinging anyone from an announcement has to be a decision
  // made in code, never a consequence of what was typed into a modal.
  describe('for a theme whose name or message carries a mention', () => {
    const pinging: ThemeEntry[] = [
      { name: 'Weekly theme origami', message: 'Fold something' },
      {
        name: 'Weekly theme @everyone',
        message: 'Over to <@&123456789012345678> and @here',
      },
    ];
    const text =
      '# Weekly theme @everyone\nOver to <@&123456789012345678> and @here';

    it('posts it with every mention disabled from the scheduled rotation', async () => {
      vi.mocked(getThemes).mockResolvedValue(pinging);
      expect(await postedByScheduled()).toEqual([
        [{ content: text, allowedMentions: { parse: [] } }],
      ]);
    });

    it('posts it with every mention disabled from rotate-now', async () => {
      vi.mocked(getThemes).mockResolvedValue(pinging);
      expect(await postedByRotateNow()).toEqual([
        [{ content: text, allowedMentions: { parse: [] } }],
      ]);
    });
  });
});

// ─── the permission the post needs ────────────────────────────────────────────

// The startup check used to demand Send Messages only when some theme had a
// message, because a list of blanks never posted. Every rename posts now, so a
// list of blanks with no Send Messages would pass startup and then fail to post
// every single week.
describe('the startup check requires Send Messages whatever the messages are', () => {
  function makeClientLacking(missing: bigint) {
    const channel = {
      name: 'weekly-theme-origami',
      permissionsFor: () => ({ has: (flag: bigint) => flag !== missing }),
    };
    return {
      user: { id: 'bot' },
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
    } as unknown as Client;
  }

  it('fails when the bot cannot send messages and no theme has a message', async () => {
    vi.mocked(getThemes).mockResolvedValue([
      { name: 'Weekly theme origami' },
      'Weekly theme pottery',
    ]);

    const ok = await validatePermissions(
      makeClientLacking(PermissionFlagsBits.SendMessages),
      { channelId: 'theme-channel' },
    );

    expect(ok).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Send Messages'),
    );
  });

  it('passes when the bot has every permission it needs', async () => {
    vi.mocked(getThemes).mockResolvedValue([{ name: 'Weekly theme origami' }]);

    const ok = await validatePermissions(makeClientLacking(BigInt(0)), {
      channelId: 'theme-channel',
    });

    expect(ok).toBe(true);
  });
});
