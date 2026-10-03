import type { CommandHandler } from '../types';
import { MessageFlags, type RateLimitData } from 'discord.js';
import { rotateTheme, isRotationInProgress } from '../rotation';
import { onRateLimited } from '../rate-limits';
import { requireAdmin } from './index';

export const rotateNow: CommandHandler = async (interaction, context) => {
  if (!(await requireAdmin(interaction))) return;

  if (isRotationInProgress()) {
    await interaction.reply({
      content: 'A rotation is already in progress. Please wait.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // A rename Discord is holding back does not fail. It waits, for up to ten
  // minutes, and without this the reply sits on "thinking..." the whole time,
  // which reads as a hang and invites running the command again.
  let waitingNotice: Promise<unknown> = Promise.resolve();
  const stopWatching = onRateLimited((limit) => {
    if (!isRenameOf(limit, context.config.channelId)) return;
    waitingNotice = interaction
      .editReply({ content: renameWaitNotice(limit.retryAfter) })
      .catch(() => {});
  });

  let result;
  try {
    result = await rotateTheme(context.client, context.config);
  } finally {
    stopWatching();
  }

  // The notice is sent without holding up the rotation. It has to land before
  // the result, or it would arrive second and overwrite it with a stale wait.
  await waitingNotice;

  if (result.success) {
    // The name rotateTheme says it applied. This used to be re-derived from the
    // saved index minus one, which stopped being right when the index came to
    // mean the applied theme rather than the next one.
    await interaction.editReply({
      content: `Theme rotated! New theme: \`${result.themeName ?? 'unknown theme'}\``,
    });
  } else {
    const reason = result.error ? `\n> ${result.error}` : '';
    await interaction.editReply({
      content: `Rotation failed.${reason}\n\nCheck the bot logs for full details.`,
    });
  }
};

/**
 * Only a rename of the channel this rotation is renaming. Posting the
 * announcement and reading the channel go to other routes or methods and are
 * not what the admin is waiting on.
 */
function isRenameOf(limit: RateLimitData, channelId: string): boolean {
  return (
    limit.route === '/channels/:id' &&
    limit.method.toUpperCase() === 'PATCH' &&
    limit.majorParameter === channelId
  );
}

/**
 * The earlier renames inside the window are often a mod's by hand, so this does
 * not claim the bot made them.
 */
function renameWaitNotice(retryAfterMs: number): string {
  return (
    'Discord only lets a channel be renamed twice in ten minutes, so this ' +
    `rename is waiting its turn. It should go through in ${describeWait(retryAfterMs)}, ` +
    'then the rotation finishes by itself and this message updates. No need ' +
    'to run it again.'
  );
}

/** Rounded, never up: 600050ms is Discord's 600 seconds plus a 50ms offset. */
function describeWait(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return 'less than a minute';
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? 'about a minute' : `about ${minutes} minutes`;
}
