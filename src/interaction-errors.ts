import { MessageFlags } from 'discord.js';
import type { RepliableInteraction } from 'discord.js';

export const MAX_MESSAGE_LENGTH = 2000;

/**
 * The bot runs on hosting the admin team cannot read logs from, so console
 * output goes nowhere. Every error a handler throws has to be delivered to the
 * invoking admin as a message they can screenshot.
 */
export function formatHandlerError(err: unknown): string {
  let name = 'Error';
  let message: string;

  if (err instanceof Error) {
    name = err.constructor?.name ?? 'Error';
    message = err.message || String(err);
  } else if (err === undefined) {
    message = 'undefined was thrown';
  } else if (err === null) {
    message = 'null was thrown';
  } else {
    name = typeof err;
    message = String(err);
  }

  return `${name}: ${message}`.slice(0, MAX_MESSAGE_LENGTH);
}

const PREFIX = 'Something went wrong running that command.\n> ';

/**
 * Reports a handler failure back into Discord. Chooses reply or followUp based
 * on what the interaction has already done, and swallows its own delivery
 * failure so the boundary can never become the thing that throws. A handler
 * that burned the 3 second window leaves an interaction whose token is already
 * dead (10062 Unknown interaction), and there is nothing to do about that
 * except log it.
 */
export async function reportHandlerError(
  interaction: RepliableInteraction,
  err: unknown,
): Promise<void> {
  const detail = formatHandlerError(err);
  console.error(`Handler error: ${detail}`, err);

  const payload = {
    content: `${PREFIX}${detail}`.slice(0, MAX_MESSAGE_LENGTH),
    flags: MessageFlags.Ephemeral as const,
  };

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (reportErr) {
    console.error(
      `Could not deliver the error to Discord: ${formatHandlerError(reportErr)}`,
    );
  }
}
