import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

vi.mock('../config', () => ({
  reloadConfig: vi.fn(() => ({ channelId: '1' })),
  getConfig: vi.fn(() => ({ channelId: '1' })),
}));
vi.mock('../themes', () => ({ reloadThemes: vi.fn() }));
vi.mock('../scheduler', () => ({ scheduleCronJob: vi.fn() }));
vi.mock('../rotation', () => ({ rotateTheme: vi.fn() }));
vi.mock('../runtime-files', () => ({ readRuntimeFiles: vi.fn() }));

import { reloadConfig } from '../config';
import { reloadThemes } from '../themes';
import { scheduleCronJob } from '../scheduler';
import { readRuntimeFiles } from '../runtime-files';
import { reloadConfigCmd } from '../commands/reload-config';

// reload-config is the only way to read themes.json from inside Discord, so it
// has to hand the file over on every exit path. The paths that fail are exactly
// the ones where seeing the raw bytes matters most.

function adminInteraction() {
  return {
    inGuild: () => true,
    memberPermissions: { has: () => true },
    client: {},
    replied: false,
    deferred: false,
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction & {
    reply: ReturnType<typeof vi.fn>;
  };
}

function attachedNames(interaction: { reply: ReturnType<typeof vi.fn> }) {
  const [payload] = interaction.reply.mock.calls[0];
  return (payload.files ?? []).map((f: { name: string | null }) => f.name);
}

beforeEach(() => {
  vi.mocked(readRuntimeFiles).mockResolvedValue([
    {
      name: 'themes.json',
      path: '/themes.json',
      content: '{"themes":[]}',
      error: null,
    },
    {
      name: 'state.json',
      path: '/state.json',
      content: '{"currentIndex":0}',
      error: null,
    },
  ]);
  vi.mocked(reloadConfig).mockReturnValue({ channelId: '1' });
  vi.mocked(reloadThemes).mockResolvedValue([{ name: 'Macro', message: 'm' }]);
  vi.mocked(scheduleCronJob).mockReturnValue(undefined as never);
});

// themes.json is hand edited on the volume, which calls neither addTheme nor
// updateTheme. reload-config is the moment the bot first sees that edit, so it
// is the last place a bad entry can be caught before the rotation reaches it.
describe('reloadConfigCmd audits the file it just loaded', () => {
  const contentOf = (i: { reply: ReturnType<typeof vi.fn> }) =>
    i.reply.mock.calls[0][0].content as string;

  it('says nothing about problems when the list is clean', async () => {
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).not.toMatch(/problem/i);
  });

  it('reports a name that would wedge the rotation', async () => {
    vi.mocked(reloadThemes).mockResolvedValue([
      { name: 'Macro', message: 'm' },
      { name: '🔥🔥🔥', message: 'm' },
    ]);
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toMatch(/channel name/i);
  });

  it('reports the position of the bad entry', async () => {
    vi.mocked(reloadThemes).mockResolvedValue([
      { name: 'Macro', message: 'm' },
      { name: '🔥🔥🔥', message: 'm' },
    ]);
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toContain('2');
  });

  it('reports a duplicate name, which is what broke edit-theme in August', async () => {
    vi.mocked(reloadThemes).mockResolvedValue([
      { name: 'Thicc and Thirsty', message: 'a' },
      { name: 'Thicc and Thirsty', message: 'b' },
    ]);
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toMatch(/same name/i);
  });

  it('still attaches the files when it finds problems', async () => {
    vi.mocked(reloadThemes).mockResolvedValue([{ name: '!!!', message: 'm' }]);
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(attachedNames(interaction)).toContain('themes.json');
  });

  it('keeps the reply inside the Discord message cap on a badly broken file', async () => {
    vi.mocked(reloadThemes).mockResolvedValue(
      Array.from({ length: 200 }, () => ({ name: '!!!', message: 'm' })),
    );
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction).length).toBeLessThanOrEqual(2000);
  });

  // A bad list is still a loaded list. Refusing to reload would leave the bot
  // running the previous one with no way to see the new file.
  it('still reloads and reschedules despite problems', async () => {
    vi.mocked(reloadThemes).mockResolvedValue([{ name: '!!!', message: 'm' }]);
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(scheduleCronJob).toHaveBeenCalled();
  });
});

describe('reloadConfigCmd runtime file dump', () => {
  it('attaches both runtime files on the happy path', async () => {
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(attachedNames(interaction)).toEqual(['themes.json', 'state.json']);
  });

  it('still attaches themes.json when the theme list loads empty', async () => {
    // A themes.json that will not parse routes here, because loadThemes
    // swallows the error and returns an empty array. This is the state where
    // the raw bytes matter most.
    vi.mocked(reloadThemes).mockResolvedValue([]);
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(attachedNames(interaction)).toContain('themes.json');
  });

  it('still attaches themes.json when the cron schedule is invalid', async () => {
    vi.mocked(scheduleCronJob).mockImplementation(() => {
      throw new Error('Invalid cron expression');
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(attachedNames(interaction)).toContain('themes.json');
  });

  it('still attaches themes.json when config.json cannot be read', async () => {
    vi.mocked(reloadConfig).mockImplementation(() => {
      throw new Error('config.json not found');
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(attachedNames(interaction)).toContain('themes.json');
  });

  it('reports a file it could not read instead of dropping it silently', async () => {
    vi.mocked(readRuntimeFiles).mockResolvedValue([
      {
        name: 'themes.json',
        path: '/themes.json',
        content: null,
        error: 'ENOENT: no such file',
      },
      {
        name: 'state.json',
        path: '/state.json',
        content: '{"currentIndex":0}',
        error: null,
      },
    ]);
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    const [payload] = interaction.reply.mock.calls[0];
    expect(payload.content).toContain('ENOENT');
  });
});
