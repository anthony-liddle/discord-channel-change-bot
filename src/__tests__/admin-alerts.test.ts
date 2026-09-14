import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Client } from 'discord.js';
import type { Config } from '../types';
import {
  describeAlertProbe,
  probeAlertChannel,
  reportRotationFailure,
  reportRotationSuccess,
  successNoticesEnabled,
} from '../admin-alerts';

/**
 * Every serious bug in this project has been invisible rather than loud: a dead
 * deploy nobody noticed for five months, a marker reporting a stale build, and
 * a rotation wedge whose only symptom is a channel name that stops changing.
 *
 * The one rule that cannot bend: reporting a failure must never be able to
 * cause one. Every path here swallows its own error.
 */

const CHANNEL = '9999';

function makeClient(fetchImpl: () => unknown) {
  return {
    channels: { fetch: vi.fn(fetchImpl) },
  } as unknown as Client;
}

function sendableChannel() {
  return {
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue(undefined),
  };
}

const withAdmin: Config = { channelId: '1', adminChannelId: CHANNEL };
const withoutAdmin: Config = { channelId: '1' };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('reportRotationFailure when no admin channel is configured', () => {
  it('does nothing and does not throw', async () => {
    const client = makeClient(() => sendableChannel());

    await expect(
      reportRotationFailure(client, withoutAdmin, 'boom'),
    ).resolves.toBeUndefined();

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('treats an empty admin channel id as absent', async () => {
    const client = makeClient(() => sendableChannel());

    await reportRotationFailure(
      client,
      { channelId: '1', adminChannelId: '   ' },
      'boom',
    );

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('treats a non-string admin channel id as absent rather than throwing', async () => {
    const client = makeClient(() => sendableChannel());

    await expect(
      reportRotationFailure(
        client,
        { channelId: '1', adminChannelId: 12345 } as unknown as Config,
        'boom',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('reportRotationFailure when an admin channel is configured', () => {
  it('posts the failure detail', async () => {
    const channel = sendableChannel();
    const client = makeClient(() => channel);

    await reportRotationFailure(client, withAdmin, 'Channel 5 not found');

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send.mock.calls[0][0]).toContain('Channel 5 not found');
  });

  // The wedge's defining property, and the thing an admin needs told.
  it('says the rotation position did not advance', async () => {
    const channel = sendableChannel();
    const client = makeClient(() => channel);

    await reportRotationFailure(client, withAdmin, 'boom');

    expect(channel.send.mock.calls[0][0]).toMatch(/did not advance/i);
  });

  it('keeps the report inside the Discord message cap', async () => {
    const channel = sendableChannel();
    const client = makeClient(() => channel);

    await reportRotationFailure(client, withAdmin, 'x'.repeat(9000));

    expect(channel.send.mock.calls[0][0].length).toBeLessThanOrEqual(2000);
  });
});

// A missing or misconfigured admin channel must never become a second outage
// on top of the one being reported.
describe('reportRotationFailure never throws', () => {
  it('survives the channel not existing', async () => {
    const client = makeClient(() => null);

    await expect(
      reportRotationFailure(client, withAdmin, 'boom'),
    ).resolves.toBeUndefined();
  });

  it('survives the fetch rejecting', async () => {
    const client = makeClient(() => {
      throw new Error('Unknown Channel');
    });

    await expect(
      reportRotationFailure(client, withAdmin, 'boom'),
    ).resolves.toBeUndefined();
  });

  it('survives the channel not being text based', async () => {
    const client = makeClient(() => ({ isTextBased: () => false }));

    await expect(
      reportRotationFailure(client, withAdmin, 'boom'),
    ).resolves.toBeUndefined();
  });

  it('survives send rejecting, which is what a missing permission looks like', async () => {
    const channel = {
      isTextBased: () => true,
      send: vi.fn().mockRejectedValue(new Error('Missing Permissions')),
    };
    const client = makeClient(() => channel);

    await expect(
      reportRotationFailure(client, withAdmin, 'boom'),
    ).resolves.toBeUndefined();
  });

  it('logs rather than staying silent when it cannot report', async () => {
    const client = makeClient(() => null);

    await reportRotationFailure(client, withAdmin, 'boom');

    expect(console.error).toHaveBeenCalled();
  });
});

// ─── probing the alert path ───────────────────────────────────────────────────

/**
 * reload-config checks the alert path by posting to it, not by inspecting
 * permissions. Arrival is the only real proof: a permission read can be right
 * while the post still fails, and the whole point of the alert channel is that
 * nobody finds out during a real failure.
 */
describe('probeAlertChannel', () => {
  it('reports not configured when there is no admin channel', async () => {
    const probe = await probeAlertChannel(
      makeClient(() => sendableChannel()),
      withoutAdmin,
    );
    expect(probe.status).toBe('not-configured');
  });

  it('does not try to post when there is no admin channel', async () => {
    const client = makeClient(() => sendableChannel());
    await probeAlertChannel(client, withoutAdmin);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('reports posted when the message actually lands', async () => {
    const channel = sendableChannel();
    const probe = await probeAlertChannel(
      makeClient(() => channel),
      withAdmin,
    );

    expect(probe.status).toBe('posted');
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('posts something that says what the check was', async () => {
    const channel = sendableChannel();
    await probeAlertChannel(
      makeClient(() => channel),
      withAdmin,
    );
    expect(channel.send.mock.calls[0][0]).toMatch(/alert/i);
  });

  it('reports unreachable when the channel does not exist', async () => {
    const probe = await probeAlertChannel(
      makeClient(() => null),
      withAdmin,
    );
    expect(probe.status).toBe('unreachable');
  });

  it('reports unreachable when the fetch rejects', async () => {
    const probe = await probeAlertChannel(
      makeClient(() => {
        throw new Error('Unknown Channel');
      }),
      withAdmin,
    );
    expect(probe.status).toBe('unreachable');
  });

  it('reports cannot post when send is refused', async () => {
    const channel = {
      isTextBased: () => true,
      send: vi.fn().mockRejectedValue(new Error('Missing Permissions')),
    };
    const probe = await probeAlertChannel(
      makeClient(() => channel),
      withAdmin,
    );

    expect(probe.status).toBe('cannot-post');
    if (probe.status === 'cannot-post') {
      expect(probe.detail).toContain('Missing Permissions');
    }
  });

  it('never throws, whatever the channel does', async () => {
    for (const fetchImpl of [
      () => null,
      () => {
        throw new Error('boom');
      },
      () => ({ isTextBased: () => false }),
    ]) {
      await expect(
        probeAlertChannel(makeClient(fetchImpl), withAdmin),
      ).resolves.toBeDefined();
    }
  });
});

describe('describeAlertProbe', () => {
  it('says alerts are off when nothing is configured', () => {
    const text = describeAlertProbe({ status: 'not-configured' }, true);
    expect(text).toMatch(/not set|no admin channel|off/i);
  });

  it('names the config key so the admin knows what to set', () => {
    const text = describeAlertProbe({ status: 'not-configured' }, true);
    expect(text).toContain('adminChannelId');
  });

  it('confirms a working path', () => {
    const text = describeAlertProbe(
      { status: 'posted', channelId: CHANNEL },
      true,
    );
    expect(text).toMatch(/working|posted|reached/i);
  });

  it('warns loudly when the channel cannot be posted to', () => {
    const text = describeAlertProbe(
      {
        status: 'cannot-post',
        channelId: CHANNEL,
        detail: 'Missing Permissions',
      },
      true,
    );
    expect(text).toMatch(/will not|cannot/i);
    expect(text).toContain('Missing Permissions');
  });

  it('warns when the channel cannot be reached', () => {
    const text = describeAlertProbe(
      { status: 'unreachable', channelId: CHANNEL, detail: 'Unknown Channel' },
      true,
    );
    expect(text).toMatch(/will not|cannot/i);
  });

  it('says whether weekly success notices are on', () => {
    const on = describeAlertProbe(
      { status: 'posted', channelId: CHANNEL },
      true,
    );
    const off = describeAlertProbe(
      { status: 'posted', channelId: CHANNEL },
      false,
    );
    expect(on).not.toBe(off);
    expect(off).toMatch(/off|disabled/i);
  });
});

// ─── the weekly success notice ────────────────────────────────────────────────

/**
 * fly logs is a live tail with a short buffer, so a Monday failure can be gone
 * before anyone notices a stale channel name on Wednesday. A weekly success
 * line makes silence evidence rather than ambiguity, and proves the alert path
 * still works every week rather than at the moment it was last tested.
 */
describe('successNoticesEnabled', () => {
  it('is on by default when an admin channel is set', () => {
    expect(successNoticesEnabled(withAdmin)).toBe(true);
  });

  it('is off when switched off explicitly', () => {
    expect(
      successNoticesEnabled({ ...withAdmin, adminSuccessNotices: false }),
    ).toBe(false);
  });

  it('is on when switched on explicitly', () => {
    expect(
      successNoticesEnabled({ ...withAdmin, adminSuccessNotices: true }),
    ).toBe(true);
  });

  it('treats a non-boolean as on rather than guessing', () => {
    expect(
      successNoticesEnabled({
        ...withAdmin,
        adminSuccessNotices: 'yes',
      } as unknown as Config),
    ).toBe(true);
  });
});

describe('reportRotationSuccess', () => {
  const applied = { themeName: 'Fixture 1', channelName: 'fixture-1' };

  it('posts the notice when an admin channel is set', async () => {
    const channel = sendableChannel();
    await reportRotationSuccess(
      makeClient(() => channel),
      withAdmin,
      applied,
    );

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send.mock.calls[0][0]).toContain('fixture-1');
  });

  it('does not post when success notices are switched off', async () => {
    const channel = sendableChannel();
    await reportRotationSuccess(
      makeClient(() => channel),
      { ...withAdmin, adminSuccessNotices: false },
      applied,
    );

    expect(channel.send).not.toHaveBeenCalled();
  });

  it('does not post when no admin channel is set', async () => {
    const client = makeClient(() => sendableChannel());
    await reportRotationSuccess(client, withoutAdmin, applied);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  // Switching success notices off must not switch failures off with them.
  it('still reports failures when success notices are off', async () => {
    const channel = sendableChannel();
    await reportRotationFailure(
      makeClient(() => channel),
      { ...withAdmin, adminSuccessNotices: false },
      'boom',
    );

    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('never throws when the notice cannot be posted', async () => {
    const channel = {
      isTextBased: () => true,
      send: vi.fn().mockRejectedValue(new Error('Missing Permissions')),
    };

    await expect(
      reportRotationSuccess(
        makeClient(() => channel),
        withAdmin,
        applied,
      ),
    ).resolves.toBeUndefined();
  });

  it('never throws when the channel is gone', async () => {
    await expect(
      reportRotationSuccess(
        makeClient(() => null),
        withAdmin,
        applied,
      ),
    ).resolves.toBeUndefined();
  });

  it('keeps the notice inside the Discord message cap', async () => {
    const channel = sendableChannel();
    await reportRotationSuccess(
      makeClient(() => channel),
      withAdmin,
      {
        themeName: 'x'.repeat(9000),
        channelName: 'y'.repeat(9000),
      },
    );

    expect(channel.send.mock.calls[0][0].length).toBeLessThanOrEqual(2000);
  });
});
