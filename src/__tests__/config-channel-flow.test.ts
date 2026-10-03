import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction, Client } from 'discord.js';
import type { Config } from '../types';

vi.mock('../config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config')>()),
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
}));

import { getConfig, saveConfig } from '../config';
import { configChannel } from '../commands/config/channel';

const config: Config = {
  channelId: '111111111111111111',
  adminChannelId: '222222222222222222',
  schedule: '0 8 * * 1',
  timezone: 'America/Los_Angeles',
};

beforeEach(() => {
  vi.mocked(getConfig).mockReturnValue(config);
  vi.mocked(saveConfig).mockResolvedValue(undefined);
});

function picker(channelId: string | null) {
  const pick = {
    values: [channelId],
    update: vi.fn().mockResolvedValue(undefined),
  };
  const response = {
    awaitMessageComponent: vi.fn(() =>
      channelId === null
        ? Promise.reject(new Error('Collector received no interactions'))
        : Promise.resolve(pick),
    ),
  };
  const interaction = {
    user: { id: 'admin-1' },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    reply: vi.fn().mockResolvedValue(response),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
  return { interaction, pick };
}

async function run(interaction: ReturnType<typeof picker>['interaction']) {
  await configChannel(interaction as unknown as ChatInputCommandInteraction, {
    client: {} as Client,
    config,
  });
}

const contentOf = (fn: ReturnType<typeof vi.fn>) =>
  (fn.mock.calls.at(-1)![0] as { content: string }).content;

describe('picking a new rotation channel', () => {
  it('saves it, keeping the rest of config.json', async () => {
    const { interaction } = picker('333333333333333333');

    await run(interaction);

    expect(saveConfig).toHaveBeenCalledWith({
      ...config,
      channelId: '333333333333333333',
    });
  });

  it('confirms the new channel', async () => {
    const { interaction, pick } = picker('333333333333333333');

    await run(interaction);

    expect(contentOf(pick.update)).toContain('<#333333333333333333>');
  });

  it('shows and preselects the current channel', async () => {
    const { interaction } = picker(null);

    await run(interaction);

    const first = interaction.reply.mock.calls[0][0] as {
      content: string;
      components: {
        toJSON(): { components: { default_values?: { id: string }[] }[] };
      }[];
    };
    expect(first.content).toContain('<#111111111111111111>');
    expect(
      first.components[0]
        .toJSON()
        .components[0].default_values?.map((v) => v.id),
    ).toEqual(['111111111111111111']);
  });

  it('says it timed out when nothing is picked, and saves nothing', async () => {
    const { interaction } = picker(null);

    await run(interaction);

    expect(contentOf(interaction.editReply)).toBe(
      'Channel selection timed out.',
    );
    expect(saveConfig).not.toHaveBeenCalled();
  });
});

// Only waiting for the pick can time out. A save that failed used to be
// reported as a timeout as well, while the rotation channel stayed unchanged.
describe('a failure after the pick is not reported as a timeout', () => {
  it('says the save failed, with the reason', async () => {
    vi.mocked(saveConfig).mockRejectedValue(
      new Error('EACCES: permission denied'),
    );
    const { interaction, pick } = picker('333333333333333333');

    await run(interaction);

    const said = contentOf(pick.update);
    expect(said).toContain('EACCES: permission denied');
    expect(said).not.toMatch(/timed out/i);
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('lets a failed confirmation through to the error report', async () => {
    const { interaction, pick } = picker('333333333333333333');
    pick.update.mockRejectedValue(new Error('Unknown interaction'));

    await expect(run(interaction)).rejects.toThrow('Unknown interaction');
    expect(saveConfig).toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });
});
