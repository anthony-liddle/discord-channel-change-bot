import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PermissionFlagsBits, type Client } from 'discord.js';
import type { Config, ThemeEntry } from '../types';

// State that really advances, so "did the position move" is answered by the
// index rotateTheme saved rather than by whether a mock was called.
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
import {
  isRotationInProgress,
  rotateTheme,
  validatePermissions,
} from '../rotation';

const config: Config = { channelId: '111111111111111111' };

const themes: ThemeEntry[] = [
  { name: 'Weekly theme origami', message: 'Fold something.' },
  { name: 'Weekly theme pottery', message: 'Show us.' },
];

/** What discord.js rejects with, carrying the fields describeDiscordError reads. */
function discordError(message: string, code: number, status: number) {
  return Object.assign(new Error(message), {
    code,
    status,
    method: 'PATCH',
    url: 'https://discord.com/api/v10/channels/111111111111111111',
  });
}

function makeChannel(name = 'weekly-theme-origami') {
  const channel = {
    name,
    setName: vi.fn(async (newName: string) => {
      channel.name = newName;
    }),
    send: vi.fn().mockResolvedValue(undefined),
  };
  return channel;
}

function clientWith(fetch: () => Promise<unknown>) {
  return { channels: { fetch: vi.fn(fetch) } } as unknown as Client;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getThemes).mockResolvedValue(themes);
  currentIndex = 0;
});

// ─── failures that must not move the rotation ─────────────────────────────────

// The admin alert and the runbook both promise that a failed rotation leaves
// the position where it was, so next week tries the same theme rather than
// skipping it. Each of these pins that promise for one way of failing.
describe('a rotation that cannot rename does not advance', () => {
  it('fails, touching nothing, when there are no themes', async () => {
    vi.mocked(getThemes).mockResolvedValue([]);
    const client = clientWith(async () => makeChannel());

    expect(await rotateTheme(client, config)).toEqual({
      success: false,
      error: 'No themes configured',
    });
    expect(client.channels.fetch).not.toHaveBeenCalled();
    expect(currentIndex).toBe(0);
  });

  it('fails when the channel comes back empty', async () => {
    const result = await rotateTheme(
      clientWith(async () => null),
      config,
    );

    expect(result).toEqual({
      success: false,
      error: 'Channel 111111111111111111 not found',
    });
    expect(currentIndex).toBe(0);
  });

  // What discord.js actually does for a deleted channel or a wrong id: it
  // throws rather than returning null.
  it('fails with the Discord error when fetching the channel throws', async () => {
    const result = await rotateTheme(
      clientWith(async () => {
        throw discordError('Unknown Channel', 10003, 404);
      }),
      config,
    );

    expect(result).toEqual({
      success: false,
      error:
        'Unknown Channel code=10003 status=404 ' +
        'PATCH https://discord.com/api/v10/channels/111111111111111111',
    });
    expect(currentIndex).toBe(0);
  });

  // A hand edit can store a name with nothing left after normalization.
  it('fails without renaming when the theme name cannot become a channel name', async () => {
    vi.mocked(getThemes).mockResolvedValue([
      themes[0],
      { name: '🔥🔥🔥', message: 'm' },
    ]);
    const channel = makeChannel();

    const result = await rotateTheme(
      clientWith(async () => channel),
      config,
    );

    expect(result).toEqual({
      success: false,
      error:
        'Channel name must have at least 1 valid character after normalization',
    });
    expect(channel.setName).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
    expect(currentIndex).toBe(0);
  });

  it('fails without posting when Discord refuses the rename', async () => {
    const channel = makeChannel();
    channel.setName.mockRejectedValue(
      discordError('Missing Permissions', 50013, 403),
    );

    const result = await rotateTheme(
      clientWith(async () => channel),
      config,
    );

    expect(result).toEqual({
      success: false,
      error:
        'Missing Permissions code=50013 status=403 ' +
        'PATCH https://discord.com/api/v10/channels/111111111111111111',
    });
    expect(channel.send).not.toHaveBeenCalled();
    expect(currentIndex).toBe(0);
  });

  it('reports a thrown value that is not an Error as text', async () => {
    const channel = makeChannel();
    channel.setName.mockRejectedValue('socket hang up');

    expect(
      await rotateTheme(
        clientWith(async () => channel),
        config,
      ),
    ).toEqual({ success: false, error: 'socket hang up' });
    expect(currentIndex).toBe(0);
  });
});

// ─── outcomes that still count as a rotation ──────────────────────────────────

describe('a rotation that renamed still counts when the post fails', () => {
  // Announcement failures are caught separately so a missing Send Messages
  // permission cannot block the rename. The theme has gone live, so the
  // position moves on.
  it('succeeds and advances when Discord refuses the announcement', async () => {
    const channel = makeChannel();
    channel.send.mockRejectedValue(
      discordError('Missing Permissions', 50013, 403),
    );

    const result = await rotateTheme(
      clientWith(async () => channel),
      config,
    );

    expect(result).toEqual({
      success: true,
      themeName: 'Weekly theme pottery',
      channelName: 'weekly-theme-pottery',
    });
    expect(channel.name).toBe('weekly-theme-pottery');
    expect(currentIndex).toBe(1);
  });
});

// Documented in docs/HOSTING.md Appendix A as normal after a manual rename: a
// mod renamed the channel and posted by hand, so the bot neither renames nor
// posts a second announcement, but still moves the position on.
describe('a channel already carrying the theme name', () => {
  it('skips the rename and the post, and still advances', async () => {
    const channel = makeChannel('weekly-theme-pottery');

    const result = await rotateTheme(
      clientWith(async () => channel),
      config,
    );

    expect(result).toEqual({
      success: true,
      themeName: 'Weekly theme pottery',
      channelName: 'weekly-theme-pottery',
    });
    expect(channel.setName).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
    expect(currentIndex).toBe(1);
  });
});

// ─── one rotation at a time ───────────────────────────────────────────────────

// The cron and rotate-now can overlap. Two rotations at once would both read
// the same position, rename twice, and post twice.
describe('only one rotation runs at a time', () => {
  it('refuses a second rotation while the first is still renaming', async () => {
    let finishRename!: () => void;
    const channel = makeChannel();
    channel.setName.mockImplementation(
      () => new Promise<void>((resolve) => (finishRename = resolve)),
    );
    const client = clientWith(async () => channel);

    const first = rotateTheme(client, config);
    await vi.waitFor(() => expect(channel.setName).toHaveBeenCalled());

    expect(isRotationInProgress()).toBe(true);
    expect(await rotateTheme(client, config)).toEqual({
      success: false,
      error: 'Rotation already in progress',
    });

    finishRename();
    await first;
    expect(isRotationInProgress()).toBe(false);
  });

  it('releases the lock when a rotation fails partway', async () => {
    vi.mocked(getThemes).mockRejectedValueOnce(new Error('disk gone'));
    const client = clientWith(async () => makeChannel());

    expect(await rotateTheme(client, config)).toEqual({
      success: false,
      error: 'disk gone',
    });
    expect(isRotationInProgress()).toBe(false);
    expect((await rotateTheme(client, config)).success).toBe(true);
  });
});

// ─── the startup permission check ─────────────────────────────────────────────

function permissionClient(
  channel: unknown,
  user: unknown = { id: 'bot' },
): Client {
  return {
    user,
    channels: { fetch: vi.fn(async () => channel) },
  } as unknown as Client;
}

function channelLacking(...missing: bigint[]) {
  return {
    name: 'weekly-theme-origami',
    permissionsFor: () => ({
      has: (flag: bigint) => !missing.includes(flag),
    }),
  };
}

function loggedErrors(): string {
  return vi.mocked(console.error).mock.calls.flat().join('\n');
}

// Startup only warns, so this check is what tells whoever reads the logs why a
// rotation is about to fail.
describe('validatePermissions names what is wrong', () => {
  it('fails when the channel cannot be found', async () => {
    expect(await validatePermissions(permissionClient(null), config)).toBe(
      false,
    );
    expect(loggedErrors()).toContain('Channel 111111111111111111 not found');
  });

  it('fails when the id is not a channel with permissions, such as a category or a DM', async () => {
    expect(
      await validatePermissions(permissionClient({ name: 'x' }), config),
    ).toBe(false);
    expect(loggedErrors()).toContain('not found');
  });

  it('fails when the bot permissions cannot be resolved', async () => {
    const channel = { name: 'x', permissionsFor: () => null };
    expect(await validatePermissions(permissionClient(channel), config)).toBe(
      false,
    );
    expect(loggedErrors()).toContain('Could not resolve bot permissions');
  });

  it('names Manage Channels when the bot cannot rename', async () => {
    expect(
      await validatePermissions(
        permissionClient(channelLacking(PermissionFlagsBits.ManageChannels)),
        config,
      ),
    ).toBe(false);
    expect(loggedErrors()).toContain('Manage Channels');
  });

  it('names View Channel when the bot cannot see the channel', async () => {
    expect(
      await validatePermissions(
        permissionClient(channelLacking(PermissionFlagsBits.ViewChannel)),
        config,
      ),
    ).toBe(false);
    expect(loggedErrors()).toContain('View Channel');
  });

  it('names every missing permission at once', async () => {
    await validatePermissions(
      permissionClient(
        channelLacking(
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.SendMessages,
        ),
      ),
      config,
    );
    expect(loggedErrors()).toContain(
      'View Channel, Manage Channels, Send Messages (needed for announcements)',
    );
  });

  it('fails rather than throwing when fetching the channel throws', async () => {
    const client = {
      user: { id: 'bot' },
      channels: {
        fetch: vi.fn(async () => {
          throw new Error('Missing Access');
        }),
      },
    } as unknown as Client;

    expect(await validatePermissions(client, config)).toBe(false);
    expect(loggedErrors()).toContain(
      'ERROR validating permissions: Missing Access',
    );
  });
});
