import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction, Client } from 'discord.js';
import type { Config } from '../types';

vi.mock('../config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config')>()),
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
}));
vi.mock('../scheduler', () => ({
  scheduleCronJob: vi.fn(),
  stopScheduledTask: vi.fn(),
}));
vi.mock('../rotation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rotation')>()),
  rotateTheme: vi.fn(),
}));
vi.mock('../admin-alerts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../admin-alerts')>()),
  reportRotationFailure: vi.fn(),
  reportRotationSuccess: vi.fn(),
}));

import { getConfig, saveConfig } from '../config';
import { scheduleCronJob } from '../scheduler';
import { rotateTheme } from '../rotation';
import { reportRotationFailure, reportRotationSuccess } from '../admin-alerts';
import { configSchedule } from '../commands/config/schedule';

const config: Config = {
  channelId: '111111111111111111',
  adminChannelId: '222222222222222222',
  schedule: '0 9 * * 1',
  timezone: 'America/Los_Angeles',
};
const client = { marker: 'the bot client' } as unknown as Client;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getConfig).mockReturnValue(config);
  vi.mocked(saveConfig).mockResolvedValue(undefined);
});

/** A pick in one of the two menus, or a timeout if null. */
type Pick = string | null;

function picker(day: Pick, hour: Pick) {
  const dayPick = {
    values: [day],
    update: vi.fn().mockResolvedValue(undefined),
  };
  const hourPick = {
    values: [hour],
    update: vi.fn().mockResolvedValue(undefined),
  };
  const timeout = () =>
    Promise.reject(new Error('Collector received no interactions'));
  const response = {
    awaitMessageComponent: vi
      .fn()
      .mockImplementationOnce(() =>
        day === null ? timeout() : Promise.resolve(dayPick),
      )
      .mockImplementationOnce(() =>
        hour === null ? timeout() : Promise.resolve(hourPick),
      ),
  };
  const interaction = {
    user: { id: 'admin-1' },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    reply: vi.fn().mockResolvedValue(response),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
  return { interaction, dayPick, hourPick };
}

async function run(interaction: ReturnType<typeof picker>['interaction']) {
  await configSchedule(interaction as unknown as ChatInputCommandInteraction, {
    client,
    config,
  });
}

interface Option {
  value: string;
  default?: boolean;
  description?: string;
}

/** The options that carry a description, as value to description. */
const described = (options: Option[]) =>
  Object.fromEntries(
    options.filter((o) => o.description).map((o) => [o.value, o.description]),
  );

const contentOf = (fn: ReturnType<typeof vi.fn>) =>
  (fn.mock.calls.at(-1)![0] as { content: string }).content;

/** The rotation the handler scheduled, as the cron would call it. */
function scheduledRotation(): () => Promise<void> {
  return vi.mocked(scheduleCronJob).mock.calls.at(-1)![2];
}

describe('picking a new day and time', () => {
  it('saves it and reschedules in the configured timezone', async () => {
    const { interaction } = picker('1', '8');

    await run(interaction);

    expect(saveConfig).toHaveBeenCalledWith({
      ...config,
      schedule: '0 8 * * 1',
    });
    expect(scheduleCronJob).toHaveBeenCalledWith(
      '0 8 * * 1',
      'America/Los_Angeles',
      expect.any(Function),
    );
  });

  it('confirms the new schedule in words', async () => {
    const { interaction, hourPick } = picker('5', '20');

    await run(interaction);

    expect(contentOf(hourPick.update)).toContain(
      'every **Friday** at **8:00 PM** (America/Los_Angeles)',
    );
  });

  // Discord sends nothing when the option picked is already the selected one,
  // so a preselected current day could not be picked again: keeping the day
  // and changing only the time was impossible. The current value is labelled
  // instead of selected.
  it('marks the current day without preselecting it', async () => {
    const { interaction } = picker(null, null);

    await run(interaction);

    const first = interaction.reply.mock.calls[0][0] as {
      content: string;
      components: { toJSON(): { components: { options: Option[] }[] } }[];
    };
    expect(first.content).toContain(
      'every **Monday** at **9:00 AM** (America/Los_Angeles)',
    );
    const options = first.components[0].toJSON().components[0].options;
    expect(options.filter((o) => o.default)).toEqual([]);
    expect(described(options)).toEqual({ '1': 'Current' });
  });

  it('marks the current time without preselecting it', async () => {
    const { interaction, dayPick } = picker('1', null);

    await run(interaction);

    const step2 = dayPick.update.mock.calls[0][0] as {
      components: { toJSON(): { components: { options: Option[] }[] } }[];
    };
    const options = step2.components[0].toJSON().components[0].options;
    expect(options.filter((o) => o.default)).toEqual([]);
    expect(described(options)).toEqual({ '9': 'Current' });
  });

  it('shows a schedule it cannot describe as the raw expression', async () => {
    const { interaction } = picker(null, null);

    await configSchedule(
      interaction as unknown as ChatInputCommandInteraction,
      {
        client,
        config: { ...config, schedule: '30 8 * * 1-5' },
      },
    );

    expect(
      (interaction.reply.mock.calls[0][0] as { content: string }).content,
    ).toContain('Custom schedule (`30 8 * * 1-5`) in America/Los_Angeles');
  });
});

// scheduled-rotation exists so that every cron callback reports. Its own
// comment names the copies it replaced in index.ts and reload-config. This
// handler held a third, which called rotateTheme directly and only logged a
// failure, so changing the schedule silently turned the admin alerts off until
// the next restart or reload.
describe('the rotation scheduled by a schedule change still reports', () => {
  it('reports a failed rotation to the admin channel', async () => {
    const { interaction } = picker('1', '8');
    await run(interaction);
    vi.mocked(rotateTheme).mockResolvedValue({
      success: false,
      error: 'Missing Permissions',
    });

    await scheduledRotation()();

    expect(reportRotationFailure).toHaveBeenCalledWith(
      client,
      config,
      'Missing Permissions',
    );
  });

  it('posts the weekly success notice', async () => {
    const { interaction } = picker('1', '8');
    await run(interaction);
    vi.mocked(rotateTheme).mockResolvedValue({
      success: true,
      themeName: 'Weekly theme pottery',
      channelName: 'weekly-theme-pottery',
    });

    await scheduledRotation()();

    expect(reportRotationSuccess).toHaveBeenCalledWith(client, config, {
      themeName: 'Weekly theme pottery',
      channelName: 'weekly-theme-pottery',
    });
  });

  // Read when the rotation runs, so a later config channel change applies.
  it('reads the config when it runs, not when it was scheduled', async () => {
    const { interaction } = picker('1', '8');
    await run(interaction);
    const later: Config = { ...config, channelId: '333333333333333333' };
    vi.mocked(getConfig).mockReturnValue(later);
    vi.mocked(rotateTheme).mockResolvedValue({ success: true });

    await scheduledRotation()();

    expect(rotateTheme).toHaveBeenCalledWith(client, later);
  });
});

describe('when nothing is picked', () => {
  it('says it timed out at the day, and changes nothing', async () => {
    const { interaction } = picker(null, null);

    await run(interaction);

    expect(contentOf(interaction.editReply)).toBe(
      'Schedule configuration timed out.',
    );
    expect(saveConfig).not.toHaveBeenCalled();
    expect(scheduleCronJob).not.toHaveBeenCalled();
  });

  it('says it timed out at the time, and changes nothing', async () => {
    const { interaction } = picker('1', null);

    await run(interaction);

    expect(contentOf(interaction.editReply)).toBe(
      'Schedule configuration timed out.',
    );
    expect(saveConfig).not.toHaveBeenCalled();
    expect(scheduleCronJob).not.toHaveBeenCalled();
  });
});

// Only waiting for a pick can time out. Anything that fails after a pick
// arrived used to be reported as a timeout too, so a failed save told the
// admin to try again faster rather than what broke.
describe('a failure after the pick is not reported as a timeout', () => {
  it('says the save failed, with the reason, and does not reschedule', async () => {
    vi.mocked(saveConfig).mockRejectedValue(
      new Error('EACCES: permission denied'),
    );
    const { interaction, hourPick } = picker('1', '8');

    await run(interaction);

    const said = contentOf(hourPick.update);
    expect(said).toContain('EACCES: permission denied');
    expect(said).not.toMatch(/timed out/i);
    expect(scheduleCronJob).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('lets a failed confirmation through to the error report', async () => {
    const { interaction, hourPick } = picker('1', '8');
    hourPick.update.mockRejectedValue(new Error('Unknown interaction'));

    await expect(run(interaction)).rejects.toThrow('Unknown interaction');
    expect(saveConfig).toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('lets a failed step-two prompt through to the error report', async () => {
    const { interaction, dayPick } = picker('1', '8');
    dayPick.update.mockRejectedValue(new Error('Unknown interaction'));

    await expect(run(interaction)).rejects.toThrow('Unknown interaction');
    expect(interaction.editReply).not.toHaveBeenCalled();
  });
});
