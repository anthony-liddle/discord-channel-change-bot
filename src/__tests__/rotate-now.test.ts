import { vi, describe, it, expect, beforeEach } from 'vitest';
import type {
  ChatInputCommandInteraction,
  Client,
  RateLimitData,
} from 'discord.js';
import type { Config } from '../types';

vi.mock('../rotation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rotation')>()),
  rotateTheme: vi.fn(),
  isRotationInProgress: vi.fn(() => false),
}));
vi.mock('../themes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../themes')>()),
  getThemes: vi.fn(async () => [
    { name: 'Weekly theme origami', message: 'Fold something.' },
    { name: 'Weekly theme pottery', message: 'Show us.' },
  ]),
}));
vi.mock('../state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../state')>()),
  getState: vi.fn(() => ({ currentIndex: 1 })),
}));

import { rotateTheme } from '../rotation';
import { observeRateLimit } from '../rate-limits';
import { rotateNow } from '../commands/rotate-now';

const THEME_CHANNEL = '111111111111111111';
const config: Config = { channelId: THEME_CHANNEL };
const ROTATED = 'Theme rotated! New theme: `Weekly theme pottery`';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** What @discordjs/rest hands the hook for a held rename, per the 2026-10-01 capture. */
function heldRename(overrides: Partial<RateLimitData> = {}): RateLimitData {
  return {
    global: false,
    method: 'PATCH',
    url: `https://discord.com/api/v10/channels/${THEME_CHANNEL}`,
    route: '/channels/:id',
    majorParameter: THEME_CHANNEL,
    hash: '6e836da6cef38ba2f3dfd8568a4e9631',
    limit: 10,
    timeToReset: 9660,
    retryAfter: 600050,
    sublimitTimeout: 600050,
    scope: 'shared',
    ...overrides,
  };
}

/** The rotation is held by Discord partway through, then completes. */
function rotationHeldBy(...limits: RateLimitData[]) {
  vi.mocked(rotateTheme).mockImplementation(async () => {
    for (const limit of limits) observeRateLimit(limit);
    return { success: true, themeName: 'Weekly theme pottery' };
  });
}

function makeInteraction() {
  const edits: string[] = [];
  const interaction = {
    inGuild: () => true,
    memberPermissions: { has: () => true },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn(async ({ content }: { content: string }) => {
      edits.push(content);
    }),
  };
  return { interaction, edits };
}

async function run(
  interaction: ReturnType<typeof makeInteraction>['interaction'],
) {
  await rotateNow(interaction as unknown as ChatInputCommandInteraction, {
    client: {} as Client,
    config,
  });
}

// A held rename does not fail, it waits for up to ten minutes. Without this the
// reply sits on "thinking..." for all of it, which reads as a hang, and the
// natural response is to run the command again, which only says a rotation is
// already in progress.
describe('rotate-now says when a rename is waiting on Discord', () => {
  it('tells the admin it is waiting, roughly how long, and that it will finish by itself', async () => {
    rotationHeldBy(heldRename());
    const { interaction, edits } = makeInteraction();

    await run(interaction);

    expect(edits[0]).toMatch(/about 10 minutes/);
    expect(edits[0]).toMatch(/finish/i);
    expect(edits[0]).toMatch(/no need to run it again/i);
  });

  // The captured wait was 600050ms: Discord's 600 seconds plus the library's
  // 50ms offset. Rounding up would announce 11 minutes for a 10 minute wait.
  it('reports a 600050ms wait as 10 minutes, not 11', async () => {
    rotationHeldBy(heldRename({ retryAfter: 600050 }));
    const { interaction, edits } = makeInteraction();

    await run(interaction);

    expect(edits[0]).not.toMatch(/11 minutes/);
    expect(edits[0]).toMatch(/about 10 minutes/);
  });

  it('says less than a minute for a short wait', async () => {
    rotationHeldBy(heldRename({ retryAfter: 20050 }));
    const { interaction, edits } = makeInteraction();

    await run(interaction);

    expect(edits[0]).toMatch(/less than a minute/);
  });

  it('says a minute, not 1 minutes', async () => {
    rotationHeldBy(heldRename({ retryAfter: 70050 }));
    const { interaction, edits } = makeInteraction();

    await run(interaction);

    expect(edits[0]).toMatch(/about a minute/);
  });

  it('still ends with the rotation result', async () => {
    rotationHeldBy(heldRename());
    const { interaction, edits } = makeInteraction();

    await run(interaction);

    expect(edits).toHaveLength(2);
    expect(edits[1]).toBe(ROTATED);
  });

  // Only the method's case is not guaranteed: the library's pre-emptive path
  // falls back to a lowercase "get" when no method is set.
  it('matches the method whatever its case', async () => {
    rotationHeldBy(heldRename({ method: 'patch' }));
    const { interaction, edits } = makeInteraction();

    await run(interaction);

    expect(edits[0]).toMatch(/about 10 minutes/);
  });
});

describe('rotate-now ignores rate limits that are not its rename', () => {
  it('ignores a held rename of a different channel', async () => {
    rotationHeldBy(
      heldRename({
        majorParameter: '222222222222222222',
        url: 'https://discord.com/api/v10/channels/222222222222222222',
      }),
    );
    const { interaction, edits } = makeInteraction();

    await run(interaction);

    expect(edits).toEqual([ROTATED]);
  });

  it('ignores a limit on posting to the theme channel', async () => {
    rotationHeldBy(
      heldRename({
        route: '/channels/:id/messages',
        method: 'POST',
        url: `https://discord.com/api/v10/channels/${THEME_CHANNEL}/messages`,
      }),
    );
    const { interaction, edits } = makeInteraction();

    await run(interaction);

    expect(edits).toEqual([ROTATED]);
  });

  // Same channel, same method, different route: only the route check can
  // tell this apart from the rename.
  it('ignores an edit of a message in the theme channel', async () => {
    rotationHeldBy(
      heldRename({
        route: '/channels/:id/messages/:id',
        url: `https://discord.com/api/v10/channels/${THEME_CHANNEL}/messages/333333333333333333`,
      }),
    );
    const { interaction, edits } = makeInteraction();

    await run(interaction);

    expect(edits).toEqual([ROTATED]);
  });

  it('ignores a read of the theme channel', async () => {
    rotationHeldBy(heldRename({ method: 'GET' }));
    const { interaction, edits } = makeInteraction();

    await run(interaction);

    expect(edits).toEqual([ROTATED]);
  });
});

describe('rotate-now stops listening when its rotation ends', () => {
  it('edits nothing for a rate limit that arrives after the rotation finished', async () => {
    rotationHeldBy();
    const { interaction, edits } = makeInteraction();

    await run(interaction);
    observeRateLimit(heldRename());

    expect(edits).toEqual([ROTATED]);
  });

  it('stops listening when the rotation throws', async () => {
    vi.mocked(rotateTheme).mockRejectedValue(new Error('boom'));
    const { interaction, edits } = makeInteraction();

    await expect(run(interaction)).rejects.toThrow('boom');
    observeRateLimit(heldRename());

    expect(edits).toEqual([]);
  });
});

// The waiting notice goes out without holding up the rotation. If it were
// still in flight when the result was sent, it would land second and
// overwrite "Theme rotated!" with a stale "waiting".
describe('the waiting notice can never overwrite the result', () => {
  it('sends the result only after a slow waiting notice has landed', async () => {
    rotationHeldBy(heldRename());
    const landed: string[] = [];
    const { interaction } = makeInteraction();
    interaction.editReply = vi.fn(async ({ content }: { content: string }) => {
      const slow = !content.startsWith('Theme rotated');
      await new Promise((r) => setTimeout(r, slow ? 30 : 0));
      landed.push(content);
    });

    await run(interaction);
    // Let every edit that was started finish, so a notice still in flight
    // when rotateNow returned gets the chance to land last.
    await Promise.all(
      vi.mocked(interaction.editReply).mock.results.map((r) => r.value),
    );

    expect(landed).toHaveLength(2);
    expect(landed.at(-1)).toBe(ROTATED);
  });

  it('still sends the result when the waiting notice fails', async () => {
    rotationHeldBy(heldRename());
    const { interaction } = makeInteraction();
    const results: string[] = [];
    interaction.editReply = vi.fn(async ({ content }: { content: string }) => {
      if (!content.startsWith('Theme rotated')) throw new Error('edit failed');
      results.push(content);
    });

    await run(interaction);

    expect(results).toEqual([ROTATED]);
  });
});
