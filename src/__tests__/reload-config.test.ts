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
// Only the part that touches Discord is mocked. describeAlertProbe is the
// wording the admin actually reads, so it runs for real.
vi.mock('../admin-alerts', async (importActual) => ({
  ...(await importActual<typeof import('../admin-alerts')>()),
  probeAlertChannel: vi.fn(),
}));

import { reloadConfig } from '../config';
import { reloadThemes } from '../themes';
import { scheduleCronJob } from '../scheduler';
import { readRuntimeFiles } from '../runtime-files';
import { probeAlertChannel } from '../admin-alerts';
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
    {
      name: 'config.json',
      path: '/config.json',
      content: '{"channelId":"1"}',
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
      { name: 'Film Noir Night', message: 'a' },
      { name: 'Film Noir Night', message: 'b' },
    ]);
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toMatch(/same thing as theme/i);
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

    expect(attachedNames(interaction)).toEqual([
      'themes.json',
      'state.json',
      'config.json',
    ]);
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

// The alert channel exists to make failures visible. Whether it works was
// itself invisible until now: config.json is not readable from Discord and
// nothing ever checked the path.
describe('reloadConfigCmd reports the alert path status', () => {
  const contentOf = (i: { reply: ReturnType<typeof vi.fn> }) =>
    i.reply.mock.calls[0][0].content as string;

  it('says alerts are off when adminChannelId is not set', async () => {
    vi.mocked(probeAlertChannel).mockResolvedValue({
      status: 'not-configured',
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toContain('adminChannelId');
  });

  it('confirms a working path', async () => {
    vi.mocked(probeAlertChannel).mockResolvedValue({
      status: 'posted',
      channelId: '9',
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toMatch(/alerts: working/i);
  });

  it('warns when the bot cannot post in the admin channel', async () => {
    vi.mocked(probeAlertChannel).mockResolvedValue({
      status: 'cannot-post',
      channelId: '9',
      detail: 'Missing Permissions',
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toMatch(/broken/i);
    expect(contentOf(interaction)).toContain('Missing Permissions');
  });

  it('checks the path by posting to it rather than reading permissions', async () => {
    vi.mocked(probeAlertChannel).mockResolvedValue({
      status: 'posted',
      channelId: '9',
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(probeAlertChannel).toHaveBeenCalled();
  });
});

/**
 * The reply is assembled from four independently sized pieces: the reload
 * summary, the runtime file notes, the theme audit and the alert status line.
 * Three of them read from a hand edited config.json or from exception messages,
 * so none has a bound of its own. Per section budgets that each hold can still
 * sum past 2000, which is the same defect formatThemeProblems was fixed for,
 * one level up.
 *
 * config.json is about to be hand edited repeatedly, so these use inputs that
 * a hand edit can actually produce.
 */
describe('the assembled reply has one hard budget', () => {
  const contentOf = (i: { reply: ReturnType<typeof vi.fn> }) =>
    i.reply.mock.calls[0][0].content as string;

  beforeEach(() => {
    vi.mocked(probeAlertChannel).mockResolvedValue({
      status: 'posted',
      channelId: '9',
    });
  });

  it('caps a reply carrying an absurdly long cron expression', async () => {
    // The invalid schedule path echoes the raw string straight back.
    vi.mocked(reloadConfig).mockReturnValue({
      channelId: '1',
      schedule: 'x'.repeat(5000),
    });
    vi.mocked(scheduleCronJob).mockImplementation(() => {
      throw new Error('Invalid cron expression');
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction).length).toBeLessThanOrEqual(2000);
  });

  it('caps a reply carrying a long file read error', async () => {
    vi.mocked(readRuntimeFiles).mockResolvedValue([
      {
        name: 'themes.json',
        path: '/themes.json',
        content: null,
        error: 'E'.repeat(5000),
      },
    ]);
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction).length).toBeLessThanOrEqual(2000);
  });

  it('caps a reply carrying a long config load failure', async () => {
    vi.mocked(reloadConfig).mockImplementation(() => {
      throw new Error('C'.repeat(5000));
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction).length).toBeLessThanOrEqual(2000);
  });

  // Every section at once, each within its own budget, summing past the cap.
  it('caps a reply where every section is at its worst together', async () => {
    vi.mocked(reloadConfig).mockReturnValue({
      channelId: '1',
      schedule: 'x'.repeat(1500),
      timezone: 'T'.repeat(500),
    });
    vi.mocked(scheduleCronJob).mockImplementation(() => {
      throw new Error('Invalid cron expression');
    });
    vi.mocked(readRuntimeFiles).mockResolvedValue([
      {
        name: 'themes.json',
        path: '/themes.json',
        content: null,
        error: 'E'.repeat(800),
      },
    ]);
    vi.mocked(reloadThemes).mockResolvedValue(
      Array.from({ length: 200 }, () => ({ name: '!!!', message: 'm' })),
    );
    vi.mocked(probeAlertChannel).mockResolvedValue({
      status: 'cannot-post',
      channelId: '9',
      detail: 'D'.repeat(800),
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction).length).toBeLessThanOrEqual(2000);
  });

  it('still attaches the files when the reply is truncated', async () => {
    vi.mocked(reloadConfig).mockReturnValue({
      channelId: '1',
      schedule: 'x'.repeat(5000),
    });
    vi.mocked(scheduleCronJob).mockImplementation(() => {
      throw new Error('Invalid cron expression');
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(attachedNames(interaction)).toContain('themes.json');
  });
});

// config.json holds two channel ids and is about to be hand edited repeatedly.
describe('reloadConfigCmd warns when the alert channel is the theme channel', () => {
  const contentOf = (i: { reply: ReturnType<typeof vi.fn> }) =>
    i.reply.mock.calls[0][0].content as string;

  it('warns when both ids are the same', async () => {
    vi.mocked(reloadConfig).mockReturnValue({
      channelId: '5',
      adminChannelId: '5',
    });
    vi.mocked(probeAlertChannel).mockResolvedValue({
      status: 'posted',
      channelId: '5',
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toMatch(/warning/i);
    expect(contentOf(interaction)).toContain('adminChannelId');
  });

  it('does not warn when they are different channels', async () => {
    vi.mocked(reloadConfig).mockReturnValue({
      channelId: '5',
      adminChannelId: '9',
    });
    vi.mocked(probeAlertChannel).mockResolvedValue({
      status: 'posted',
      channelId: '9',
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).not.toMatch(/warning/i);
  });
});

/**
 * When the cap binds, the audit gives way and the alert line survives.
 *
 * The alert status and its clash warning are appended last, so a tail
 * truncation drops exactly them. That is backwards: a batch upload with
 * problems is the same moment the channel ids are most likely to be wrong, so
 * the warning matters most precisely when the audit is longest. The audit
 * already has a bound of its own and its detail is the most expendable thing in
 * the reply.
 */
describe('when the reply is too long, the audit gives way rather than the alert', () => {
  const contentOf = (i: { reply: ReturnType<typeof vi.fn> }) =>
    i.reply.mock.calls[0][0].content as string;

  /** Long enough, with 200 broken themes, to push the reply over the cap. */
  const crowdedReply = () => {
    vi.mocked(reloadConfig).mockReturnValue({
      channelId: '5',
      adminChannelId: '5',
    });
    vi.mocked(probeAlertChannel).mockResolvedValue({
      status: 'posted',
      channelId: '5',
    });
    vi.mocked(readRuntimeFiles).mockResolvedValue([
      {
        name: 'themes.json',
        path: '/themes.json',
        content: null,
        error: 'E'.repeat(600),
      },
    ]);
    vi.mocked(reloadThemes).mockResolvedValue(
      Array.from({ length: 200 }, (_, n) => ({
        name: '!!!',
        message: `m${n}`,
      })),
    );
  };

  it('keeps the alert status line', async () => {
    crowdedReply();
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toContain('Alerts:');
  });

  it('keeps the public channel warning, which is the whole point', async () => {
    crowdedReply();
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toMatch(/WARNING/);
    expect(contentOf(interaction)).toContain('adminChannelId');
  });

  it('keeps the reload result at the top', async () => {
    crowdedReply();
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toMatch(/^Config reloaded/);
  });

  it('still reports that there are theme problems at all', async () => {
    crowdedReply();
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toMatch(/problem/i);
  });

  it('is still inside the cap', async () => {
    crowdedReply();
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction).length).toBeLessThanOrEqual(2000);
  });

  it('keeps the alert line even when the reload summary is enormous', async () => {
    vi.mocked(reloadConfig).mockReturnValue({
      channelId: '5',
      adminChannelId: '5',
      schedule: 'x'.repeat(5000),
    });
    vi.mocked(scheduleCronJob).mockImplementation(() => {
      throw new Error('Invalid cron expression');
    });
    vi.mocked(probeAlertChannel).mockResolvedValue({
      status: 'posted',
      channelId: '5',
    });
    const interaction = adminInteraction();

    await reloadConfigCmd(interaction, {} as never);

    expect(contentOf(interaction)).toContain('Alerts:');
    expect(contentOf(interaction).length).toBeLessThanOrEqual(2000);
  });
});
