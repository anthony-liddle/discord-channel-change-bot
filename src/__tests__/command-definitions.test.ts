import { describe, it, expect } from 'vitest';
import { ApplicationCommandOptionType } from 'discord.js';

import { COMMAND_DEFINITIONS } from '../command-definitions';
import { getCommandHandler } from '../commands';

/** Every key a registered subcommand dispatches as, e.g. theme-bot:config:channel. */
function registeredKeys(): string[] {
  const keys: string[] = [];
  for (const command of COMMAND_DEFINITIONS) {
    for (const option of command.options ?? []) {
      if (option.type === ApplicationCommandOptionType.Subcommand) {
        keys.push(`${command.name}:${option.name}`);
      } else if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
        for (const sub of option.options ?? []) {
          keys.push(`${command.name}:${option.name}:${sub.name}`);
        }
      }
    }
  }
  return keys.sort();
}

describe('the registered commands and the router agree', () => {
  // dispatch ignores a key it has no handler for, without replying, so a
  // registered subcommand with no handler shows the admin "the application did
  // not respond" and nothing else.
  it('has a handler for every registered subcommand', () => {
    for (const key of registeredKeys()) {
      expect(getCommandHandler(key), key).toBeDefined();
    }
  });

  // pnpm register replaces the whole command list, so anything missing from
  // the definitions is deleted from Discord. The list is pinned so that a
  // subcommand only disappears on purpose.
  it('registers exactly the commands the bot serves', () => {
    expect(registeredKeys()).toEqual([
      'theme-bot:add-theme',
      'theme-bot:config:alerts',
      'theme-bot:config:channel',
      'theme-bot:config:schedule',
      'theme-bot:delete-theme',
      'theme-bot:edit-theme',
      'theme-bot:reload-config',
      'theme-bot:reorder-themes',
      'theme-bot:rotate-now',
      'theme-bot:themes',
    ]);
  });
});
