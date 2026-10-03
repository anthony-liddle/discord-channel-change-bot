import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  REST,
  Routes,
  type RateLimitData,
  type ResponseLike,
} from 'discord.js';

import { CLIENT_OPTIONS } from '../client-options';
import { observeRateLimit, onRateLimited } from '../rate-limits';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Subscriptions are module state, so a test that fails before unsubscribing
// would leak its listener into every test after it. Cleaned up here instead.
const subscriptions: (() => void)[] = [];
function subscribe(listener: Parameters<typeof onRateLimited>[0]) {
  const stop = onRateLimited(listener);
  subscriptions.push(stop);
  return stop;
}
afterEach(() => {
  for (const stop of subscriptions.splice(0)) stop();
});

const CHANNEL = '123456789012345678';

/**
 * Shaped like the real thing. Captured on 2026-10-01 from a third rename of a
 * scratch channel inside ten minutes: Discord answered 429 with retry-after
 * 600, scope shared, and 7 requests still left in the bucket, which is what
 * sends @discordjs/rest down its sublimit branch. Times are scaled down here so
 * the test waits milliseconds rather than ten minutes.
 */
function renameLimited(): Response {
  return new Response(
    JSON.stringify({
      message: 'You are being rate limited.',
      retry_after: 0.01,
      global: false,
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': '0.01',
        'x-ratelimit-limit': '10',
        'x-ratelimit-remaining': '7',
        'x-ratelimit-reset-after': '9.561',
        'x-ratelimit-scope': 'shared',
        'x-ratelimit-bucket': '6e836da6cef38ba2f3dfd8568a4e9631',
      },
    },
  );
}

function renamed(): Response {
  return new Response(JSON.stringify({ id: CHANNEL, name: 'renamed' }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-limit': '10',
      'x-ratelimit-remaining': '6',
      'x-ratelimit-reset-after': '9.4',
      'x-ratelimit-bucket': '6e836da6cef38ba2f3dfd8568a4e9631',
    },
  });
}

/** The real REST client, built from the bot's real options, offline. */
function restAnsweringWith(...responses: Response[]) {
  // Node's Response and the library's ResponseLike disagree only on the
  // stream generics of body, which the library never reads for these.
  const makeRequest = vi.fn(
    async () => responses.shift()! as unknown as ResponseLike,
  );
  const rest = new REST({
    ...CLIENT_OPTIONS.rest,
    makeRequest,
    hashSweepInterval: 0,
    handlerSweepInterval: 0,
  }).setToken('not-a-real-token');
  return { rest, makeRequest };
}

function renameChannel(rest: REST) {
  return rest.patch(Routes.channel(CHANNEL), { body: { name: 'renamed' } });
}

// ─── the rename waits rather than fails ───────────────────────────────────────

// Waiting is what the scheduled rotation needs. A rename that failed here
// would leave the rotation position where it was and try again only the
// following week, so the hook that lets the bot see a rate limit must never be
// able to turn the wait into a failure.
describe('a rate-limited rename waits and then succeeds', () => {
  it('retries after the wait and resolves with the renamed channel', async () => {
    const { rest, makeRequest } = restAnsweringWith(renameLimited(), renamed());

    await expect(renameChannel(rest)).resolves.toEqual({
      id: CHANNEL,
      name: 'renamed',
    });
    expect(makeRequest).toHaveBeenCalledTimes(2);
  });

  it('tells subscribers which route and channel is being held, and for how long', async () => {
    const seen: RateLimitData[] = [];
    subscribe((data) => seen.push(data));
    const { rest } = restAnsweringWith(renameLimited(), renamed());

    await renameChannel(rest);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      method: 'PATCH',
      route: '/channels/:id',
      majorParameter: CHANNEL,
    });
    // retry-after of 0.01s plus the library's default 50ms offset.
    expect(seen[0].retryAfter).toBe(60);
  });

  it('still succeeds when a subscriber throws', async () => {
    subscribe(() => {
      throw new Error('subscriber is broken');
    });
    const { rest } = restAnsweringWith(renameLimited(), renamed());

    await expect(renameChannel(rest)).resolves.toMatchObject({
      name: 'renamed',
    });
  });

  it('still succeeds when an async subscriber rejects', async () => {
    subscribe(async () => {
      throw new Error('async subscriber is broken');
    });
    const { rest } = restAnsweringWith(renameLimited(), renamed());

    await expect(renameChannel(rest)).resolves.toMatchObject({
      name: 'renamed',
    });
  });
});

// ─── the log line ─────────────────────────────────────────────────────────────

function data(overrides: Partial<RateLimitData> = {}): RateLimitData {
  return {
    global: false,
    method: 'PATCH',
    url: `https://discord.com/api/v10/channels/${CHANNEL}`,
    route: '/channels/:id',
    majorParameter: CHANNEL,
    hash: '6e836da6cef38ba2f3dfd8568a4e9631',
    limit: 10,
    timeToReset: 9660,
    retryAfter: 600050,
    sublimitTimeout: 600050,
    scope: 'shared',
    ...overrides,
  };
}

// fly logs was the only place a rate limit could have shown up, and nothing
// was printed, so a rename waiting ten minutes looked exactly like a hang.
describe('every rate limit is logged', () => {
  it('names the route, the channel, the scope and the wait', () => {
    observeRateLimit(data());

    expect(console.warn).toHaveBeenCalledWith(
      `Rate limited by Discord on PATCH /channels/:id (${CHANNEL}, shared scope). ` +
        'Waiting 600s, then retrying.',
    );
  });

  it('says so when the limit is global', () => {
    observeRateLimit(data({ global: true, scope: 'global', retryAfter: 2050 }));

    expect(console.warn).toHaveBeenCalledWith(
      `Rate limited by Discord on PATCH /channels/:id (${CHANNEL}, global). ` +
        'Waiting 2s, then retrying.',
    );
  });

  // Interaction replies go out through /webhooks/<app id>/<interaction token>.
  // Both the url and the majorParameter carry that token, and a live token in
  // the host logs is a credential sitting in plain text.
  it('never logs an interaction token', () => {
    const token = 'aW50ZXJhY3Rpb246MTIzOnNlY3JldA';
    observeRateLimit(
      data({
        url: `https://discord.com/api/v10/webhooks/111111111111111111/${token}/messages/@original`,
        route: '/webhooks/:id/:token/messages/:id',
        majorParameter: `111111111111111111/${token}`,
        scope: 'user',
      }),
    );

    const logged = vi.mocked(console.warn).mock.calls.flat().join(' ');
    expect(logged).toContain('/webhooks/:id/:token/messages/:id');
    expect(logged).not.toContain(token);
  });
});

// ─── subscribers ──────────────────────────────────────────────────────────────

describe('subscribing to rate limits', () => {
  it('always answers false, so the library waits instead of throwing', () => {
    expect(observeRateLimit(data())).toBe(false);
  });

  it('stops notifying once unsubscribed', () => {
    const listener = vi.fn();
    const stop = subscribe(listener);

    observeRateLimit(data());
    stop();
    observeRateLimit(data());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps notifying the others when one subscriber throws', () => {
    subscribe(() => {
      throw new Error('broken');
    });
    const listener = vi.fn();
    subscribe(listener);

    expect(observeRateLimit(data())).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
