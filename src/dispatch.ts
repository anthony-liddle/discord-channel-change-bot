import type { Client, Interaction } from 'discord.js';
import { getConfig } from './config';
import { getCommandHandler, resolveCommandKey } from './commands';
import { handleThemeAutocomplete } from './commands/theme-autocomplete';
import { reportHandlerError } from './interaction-errors';

/**
 * Routes one interaction to its handler.
 *
 * Moved out of index.ts unchanged so it can be tested: importing index.ts logs
 * in to Discord, so nothing in it can be.
 */
export async function handleInteraction(
  interaction: Interaction,
  client: Client,
): Promise<void> {
  // Autocomplete arrives here too and used to be dropped by the guard below.
  // It has its own 3 second window, cannot be deferred, and cannot show an
  // error, so the handler swallows its own failures rather than reporting them.
  if (interaction.isAutocomplete()) {
    await handleThemeAutocomplete(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const key = resolveCommandKey(interaction);
  const handler = getCommandHandler(key);
  if (!handler) return;

  try {
    await handler(interaction, { client, config: getConfig() });
  } catch (err) {
    await reportHandlerError(interaction, err);
  }
}
