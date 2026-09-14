import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Client } from 'discord.js';
import type { Config } from '../types';
import { reportRotationFailure } from '../failure-report';

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
