import { describe, it, expect } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { resolveCommandKey } from '../commands';

function mockInteraction(
  commandName: string,
  group: string | null = null,
  sub: string | null = null,
): ChatInputCommandInteraction {
  return {
    commandName,
    options: {
      getSubcommandGroup: () => group,
      getSubcommand: () => sub,
    },
  } as unknown as ChatInputCommandInteraction;
}

// ─── resolveCommandKey ────────────────────────────────────────────────────────

describe('resolveCommandKey', () => {
  it('returns just the command name when there are no subcommands', () => {
    expect(resolveCommandKey(mockInteraction('theme-bot'))).toBe('theme-bot');
  });

  it('appends the subcommand when present', () => {
    expect(
      resolveCommandKey(mockInteraction('theme-bot', null, 'themes')),
    ).toBe('theme-bot:themes');
  });

  it('appends the group and subcommand when both are present', () => {
    expect(
      resolveCommandKey(mockInteraction('theme-bot', 'config', 'channel')),
    ).toBe('theme-bot:config:channel');
  });

  it('handles a plain top-level command with no subcommand group or sub', () => {
    expect(resolveCommandKey(mockInteraction('other-command'))).toBe(
      'other-command',
    );
  });
});
