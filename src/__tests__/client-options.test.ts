import { afterAll, describe, it, expect } from 'vitest';
import { Client, MessagePayload } from 'discord.js';

import { CLIENT_OPTIONS } from '../client-options';

/**
 * No message this bot sends may notify anyone unless the code says so.
 *
 * The default lives on the client rather than at each call site because there
 * are dozens of replies across the command handlers and new ones get added.
 * This drives the real discord.js payload builder with the real options, so it
 * proves the default reaches the request body rather than proving a constant
 * holds a value. Every send resolves through MessagePayload, whether it is a
 * channel post, an interaction reply or a webhook follow-up, and each reads the
 * default from its target's client.
 */
const client = new Client(CLIENT_OPTIONS);

afterAll(async () => {
  await client.destroy();
});

function allowedMentionsFor(options: { content: string }) {
  const target = { client } as unknown as ConstructorParameters<
    typeof MessagePayload
  >[0];
  const { body } = MessagePayload.create(target, options).resolveBody();
  return (body as { allowed_mentions?: unknown } | null)?.allowed_mentions;
}

describe('every message the bot sends has mentions disabled by default', () => {
  it('sends @everyone and @here as text that pings nobody', () => {
    expect(allowedMentionsFor({ content: '@everyone and @here' })).toEqual({
      parse: [],
    });
  });

  it('sends a role mention as text that pings nobody', () => {
    expect(
      allowedMentionsFor({ content: 'Over to <@&123456789012345678>' }),
    ).toEqual({ parse: [] });
  });

  it('sends a user mention as text that pings nobody', () => {
    expect(
      allowedMentionsFor({ content: 'Thanks <@123456789012345678>' }),
    ).toEqual({ parse: [] });
  });
});
