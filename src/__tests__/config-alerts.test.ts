import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client,
} from 'discord.js';
import type { Config } from '../types';

vi.mock('../config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config')>()),
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
}));

import { getConfig, saveConfig } from '../config';
import { configAlerts } from '../commands/config/alerts';

const ROTATION = '111111111111111111';
const ADMIN = '222222222222222222';
const PRIVATE = '333333333333333333';
const PUBLIC = '444444444444444444';
const LOCKED = '555555555555555555';

const configured: Config = {
  channelId: ROTATION,
  adminChannelId: ADMIN,
  schedule: '0 8 * * 1',
  timezone: 'America/Los_Angeles',
};
const unconfigured: Config = {
  channelId: ROTATION,
  schedule: '0 8 * * 1',
  timezone: 'America/Los_Angeles',
};

/** A text channel the bot can see, readable by everyone or not. */
function textChannel(opts: { public?: boolean; refuseSend?: boolean } = {}) {
  return {
    isTextBased: () => true,
    send: opts.refuseSend
      ? vi.fn().mockRejectedValue(new Error('Missing Permissions'))
      : vi.fn().mockResolvedValue(undefined),
    guild: { roles: { everyone: { id: 'everyone-role' } } },
    permissionsFor: (role: { id: string }) => ({
      has: (flag: bigint) =>
        role.id === 'everyone-role' && flag === PermissionFlagsBits.ViewChannel
          ? Boolean(opts.public)
          : true,
    }),
  };
}

const channels = {
  [ROTATION]: textChannel({ public: true }),
  [ADMIN]: textChannel(),
  [PRIVATE]: textChannel(),
  [PUBLIC]: textChannel({ public: true }),
  [LOCKED]: textChannel({ refuseSend: true }),
};

const client = {
  channels: {
    fetch: vi.fn(
      async (id: string) => channels[id as keyof typeof channels] ?? null,
    ),
  },
} as unknown as Client;

/** What the admin does with the reply: pick a channel, press a button, or nothing. */
type Action = { pick: string } | { press: 'notices' | 'off' } | null;

function invocation(action: Action) {
  const component = {
    customId: '',
    values: [] as string[],
    user: { id: 'admin-1' },
    update: vi.fn().mockResolvedValue(undefined),
  };
  const response = {
    awaitMessageComponent: vi.fn(
      ({ filter }: { filter: (i: unknown) => boolean }) => {
        if (action === null) {
          return Promise.reject(
            new Error('Collector received no interactions'),
          );
        }
        if ('pick' in action) {
          component.customId = 'config-alerts-channel:inv-1';
          component.values = [action.pick];
        } else {
          component.customId = `config-alerts-${action.press}:inv-1`;
        }
        return filter(component)
          ? Promise.resolve(component)
          : Promise.reject(new Error('filtered out'));
      },
    ),
  };
  const interaction = {
    id: 'inv-1',
    user: { id: 'admin-1' },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    // withResponse rather than the deprecated fetchReply: the reply resolves
    // to a callback response carrying the message.
    reply: vi.fn().mockResolvedValue({ resource: { message: response } }),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
  return { interaction, component, response };
}

async function run(
  interaction: ReturnType<typeof invocation>['interaction'],
  config: Config = configured,
) {
  vi.mocked(getConfig).mockReturnValue(config);
  await configAlerts(interaction as unknown as ChatInputCommandInteraction, {
    client,
    config,
  });
}

type Payload = {
  content: string;
  components: { toJSON(): { components: Record<string, unknown>[] } }[];
  flags?: number;
};
const opening = (i: ReturnType<typeof invocation>['interaction']) =>
  i.reply.mock.calls[0][0] as Payload;
const result = (c: ReturnType<typeof invocation>['component']) =>
  (c.update.mock.calls.at(-1)![0] as Payload).content;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(saveConfig).mockResolvedValue(undefined);
  for (const c of Object.values(channels)) c.send.mockClear();
});

// ─── what the admin sees first ────────────────────────────────────────────────

describe('opening the alert settings', () => {
  it('says where alerts go and whether weekly notices are on, privately', async () => {
    const { interaction } = invocation(null);

    await run(interaction);

    expect(opening(interaction).content).toContain(`<#${ADMIN}>`);
    expect(opening(interaction).content).toMatch(
      /weekly success notices are on/i,
    );
    expect(opening(interaction).flags).toBe(MessageFlags.Ephemeral);
  });

  it('says alerts are off when no channel is set', async () => {
    const { interaction } = invocation(null);

    await run(interaction, unconfigured);

    expect(opening(interaction).content).toMatch(/alerts are off/i);
  });

  // The schedule picker could not re-pick a preselected value. Nothing here
  // is preselected, so every channel can be picked.
  it('offers a channel picker with nothing preselected', async () => {
    const { interaction } = invocation(null);

    await run(interaction);

    const picker = opening(interaction).components[0].toJSON().components[0];
    expect(picker.default_values ?? []).toEqual([]);
  });

  // Neither button means anything until there is a channel to post to.
  it('disables the notice and off buttons while alerts are off', async () => {
    const { interaction } = invocation(null);

    await run(interaction, unconfigured);

    const buttons = opening(interaction).components[1].toJSON().components;
    expect(buttons.map((b) => b.disabled)).toEqual([true, true]);
  });

  it('enables them once a channel is set', async () => {
    const { interaction } = invocation(null);

    await run(interaction);

    const buttons = opening(interaction).components[1].toJSON().components;
    expect(buttons.map((b) => Boolean(b.disabled))).toEqual([false, false]);
  });
});

// ─── picking a channel ────────────────────────────────────────────────────────

describe('picking an alert channel', () => {
  it('posts a test line there, saves it, and says it works', async () => {
    const { interaction, component } = invocation({ pick: PRIVATE });

    await run(interaction);

    expect(channels[PRIVATE].send).toHaveBeenCalledWith(
      expect.stringContaining('`/theme-bot config alerts`'),
    );
    expect(saveConfig).toHaveBeenCalledWith({
      ...configured,
      adminChannelId: PRIVATE,
    });
    expect(result(component)).toContain(`<#${PRIVATE}>`);
    expect(result(component)).toMatch(/test line/i);
  });

  // config channel and config schedule can change config.json while this
  // reply is open. Saving what the command started with would undo them.
  it('saves on top of the config as it is when saving, not as it was when opened', async () => {
    const { interaction } = invocation({ pick: PRIVATE });
    const changedMeanwhile: Config = { ...configured, schedule: '0 9 * * 2' };
    vi.mocked(getConfig).mockReturnValue(changedMeanwhile);

    await configAlerts(interaction as unknown as ChatInputCommandInteraction, {
      client,
      config: configured,
    });

    expect(saveConfig).toHaveBeenCalledWith({
      ...changedMeanwhile,
      adminChannelId: PRIVATE,
    });
  });

  it('refuses the channel the bot renames, posting and saving nothing', async () => {
    const { interaction, component } = invocation({ pick: ROTATION });

    await run(interaction);

    expect(result(component)).toMatch(/channel the bot renames/i);
    expect(channels[ROTATION].send).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  // Decided: refused, not saved with a warning. Every alert and weekly notice
  // would go to the whole server. The check runs before the test line, so
  // picking a public channel by mistake posts nothing there.
  it('refuses a channel everyone can read, posting and saving nothing', async () => {
    const { interaction, component } = invocation({ pick: PUBLIC });

    await run(interaction);

    expect(result(component)).toMatch(/everyone in the server can read/i);
    expect(channels[PUBLIC].send).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  // An alert channel the bot cannot post in is worse than none, because it
  // gets relied on. The test line is the check, so a failed one saves nothing.
  it('refuses a channel the bot cannot post in, and says why', async () => {
    const { interaction, component } = invocation({ pick: LOCKED });

    await run(interaction);

    expect(result(component)).toContain('Missing Permissions');
    expect(result(component)).toMatch(/not changed/i);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('refuses a channel the bot cannot find', async () => {
    const { interaction, component } = invocation({
      pick: '999999999999999999',
    });

    await run(interaction);

    expect(result(component)).toMatch(/not changed/i);
    expect(saveConfig).not.toHaveBeenCalled();
  });
});

// ─── the two buttons ──────────────────────────────────────────────────────────

describe('weekly success notices', () => {
  it('turns them off, keeping failure alerts on', async () => {
    const { interaction, component } = invocation({ press: 'notices' });

    await run(interaction);

    expect(saveConfig).toHaveBeenCalledWith({
      ...configured,
      adminSuccessNotices: false,
    });
    expect(result(component)).toMatch(/weekly success notices are now off/i);
    expect(result(component)).toMatch(/failures are still reported/i);
  });

  it('turns them back on', async () => {
    const { interaction, component } = invocation({ press: 'notices' });

    await run(interaction, { ...configured, adminSuccessNotices: false });

    expect(saveConfig).toHaveBeenCalledWith({
      ...configured,
      adminSuccessNotices: true,
    });
    expect(result(component)).toMatch(/weekly success notices are now on/i);
  });
});

describe('turning alerts off', () => {
  // Removed, not blanked: an empty string would still be a value for every
  // reader of config.json to interpret.
  it('removes the alert channel from config.json', async () => {
    const { interaction, component } = invocation({ press: 'off' });

    await run(interaction);

    const saved = vi.mocked(saveConfig).mock.calls[0][0];
    expect(saved).toEqual(unconfigured);
    expect('adminChannelId' in saved).toBe(false);
    expect(result(component)).toMatch(/alerts are now off/i);
  });
});

// ─── when nothing is changed ──────────────────────────────────────────────────

describe('when nothing changes', () => {
  it('says it timed out and saves nothing', async () => {
    const { interaction } = invocation(null);

    await run(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Alert settings timed out.',
      components: [],
    });
    expect(saveConfig).not.toHaveBeenCalled();
  });

  // A failed save is not a timeout.
  it('says the save failed, with the reason', async () => {
    vi.mocked(saveConfig).mockRejectedValue(
      new Error('EACCES: permission denied'),
    );
    const { interaction, component } = invocation({ press: 'notices' });

    await run(interaction);

    expect(result(component)).toContain('EACCES: permission denied');
    expect(result(component)).not.toMatch(/timed out/i);
  });

  it('accepts only the admin who opened it, on this invocation', async () => {
    const { interaction, response } = invocation(null);

    await run(interaction);

    const { filter } = response.awaitMessageComponent.mock.calls[0][0];
    const press = (customId: string, userId: string) =>
      filter({ customId, user: { id: userId } });
    expect(press('config-alerts-off:inv-1', 'admin-1')).toBe(true);
    expect(press('config-alerts-off:inv-1', 'someone-else')).toBe(false);
    expect(press('config-alerts-off:inv-2', 'admin-1')).toBe(false);
  });
});
