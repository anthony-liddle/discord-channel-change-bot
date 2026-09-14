import type { Client, TextChannel } from 'discord.js';
import type { Config } from './types';
import { MAX_MESSAGE_LENGTH } from './interaction-errors';

/**
 * Posting rotation failures somewhere a person will see them.
 *
 * Every serious bug in this project has been invisible rather than loud: a dead
 * deploy nobody noticed for five months, a marker reporting a stale build, a
 * modal collector writing to the wrong theme, and a rotation wedge whose only
 * symptom is a channel name that quietly stops changing. The scheduled rotation
 * is the one path with no human watching it, so it is the one that needs to
 * speak up.
 *
 * The rule that cannot bend: reporting a failure must never be able to cause
 * one. Every path below swallows its own error and logs instead.
 */
export async function reportRotationFailure(
  client: Client,
  config: Config,
  detail: string,
): Promise<void> {
  const channelId = readChannelId(config);
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      console.error(
        `Could not report the rotation failure: admin channel ${channelId} is not a channel the bot can post to`,
      );
      return;
    }

    await (channel as TextChannel).send(buildReport(detail));
  } catch (err) {
    console.error(
      `Could not report the rotation failure to ${channelId}: ${(err as Error).message}`,
    );
  }
}

/**
 * A hand edited config.json can put anything here, and this function is the one
 * place that must not throw, so the id is not trusted to be a string.
 */
function readChannelId(config: Config): string | null {
  const raw = (config as { adminChannelId?: unknown }).adminChannelId;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Names the consequence, not just the error. The rotation position not
 * advancing is what turns a permanent failure into the same failure every week,
 * and it is the part an admin has to know to act on.
 */
function buildReport(detail: string): string {
  const message =
    '**The weekly theme rotation failed.**\n' +
    `> ${detail}\n\n` +
    'The channel was not renamed and the rotation position did not advance, ' +
    'so the next run will try the same theme again. If the cause is the theme ' +
    'itself, fix it with `/theme-bot edit-theme` and then run ' +
    '`/theme-bot rotate-now`.';

  return message.length <= MAX_MESSAGE_LENGTH
    ? message
    : `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
}
