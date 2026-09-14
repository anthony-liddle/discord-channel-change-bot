import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Client } from 'discord.js';
import type { Config } from '../types';

vi.mock('../rotation', () => ({ rotateTheme: vi.fn() }));
vi.mock('../failure-report', () => ({ reportRotationFailure: vi.fn() }));

import { rotateTheme } from '../rotation';
import { reportRotationFailure } from '../failure-report';
import { makeScheduledRotation } from '../scheduled-rotation';

const config: Config = { channelId: '1', adminChannelId: '2' };
const client = {} as Client;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the scheduled rotation reports failures where someone will see them', () => {
  it('reports when the rotation fails', async () => {
    vi.mocked(rotateTheme).mockResolvedValue({
      success: false,
      error: 'Channel 5 not found',
    });

    await makeScheduledRotation(client, () => config)();

    expect(reportRotationFailure).toHaveBeenCalledWith(
      client,
      config,
      'Channel 5 not found',
    );
  });

  it('does not report when the rotation succeeds', async () => {
    vi.mocked(rotateTheme).mockResolvedValue({ success: true });

    await makeScheduledRotation(client, () => config)();

    expect(reportRotationFailure).not.toHaveBeenCalled();
  });

  it('reports something even when the failure carries no detail', async () => {
    vi.mocked(rotateTheme).mockResolvedValue({ success: false });

    await makeScheduledRotation(client, () => config)();

    expect(reportRotationFailure).toHaveBeenCalled();
  });

  // Config is read per run rather than captured, so /theme-bot config channel
  // and reload-config take effect without a restart.
  it('reads the config at run time rather than at schedule time', async () => {
    vi.mocked(rotateTheme).mockResolvedValue({ success: true });
    let current: Config = { channelId: 'first' };
    const run = makeScheduledRotation(client, () => current);

    current = { channelId: 'second' };
    await run();

    expect(rotateTheme).toHaveBeenCalledWith(client, { channelId: 'second' });
  });
});

// The prompt's hard constraint: a failure in the failure reporting must never
// affect the rotation.
describe('a broken reporter does not affect the rotation', () => {
  it('does not throw when the reporter throws', async () => {
    vi.mocked(rotateTheme).mockResolvedValue({ success: false, error: 'boom' });
    vi.mocked(reportRotationFailure).mockRejectedValue(
      new Error('reporting is broken'),
    );

    await expect(
      makeScheduledRotation(client, () => config)(),
    ).resolves.toBeUndefined();
  });

  it('still ran the rotation when the reporter throws', async () => {
    vi.mocked(rotateTheme).mockResolvedValue({ success: false, error: 'boom' });
    vi.mocked(reportRotationFailure).mockRejectedValue(
      new Error('reporting is broken'),
    );

    await makeScheduledRotation(client, () => config)();

    expect(rotateTheme).toHaveBeenCalledTimes(1);
  });
});
