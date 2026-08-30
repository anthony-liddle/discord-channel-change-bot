import type { CommandHandler } from '../types';
import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { reloadConfig } from '../config';
import { scheduleCronJob } from '../scheduler';
import { requireAdmin } from './index';
import { reloadThemes } from '../themes';
import { readRuntimeFiles } from '../runtime-files';

/**
 * Attaches the raw runtime files to the reply. They are attachments rather than
 * message text because themes.json will not reliably fit in the 2000 character
 * message limit, and because the point is to get the bytes out intact.
 *
 * This rides on reload-config because it is already admin only and already
 * re-reads these exact files, so the attachment always reflects what the bot
 * just loaded. /theme-bot themes would have been the other candidate and is
 * Everyone permission, which would publish the file to the whole server.
 */
async function buildRuntimeFileDump(): Promise<{
  summary: string;
  files: AttachmentBuilder[];
}> {
  const runtimeFiles = await readRuntimeFiles();
  const files: AttachmentBuilder[] = [];
  const notes: string[] = [];

  for (const file of runtimeFiles) {
    if (file.content === null) {
      notes.push(`Could not read ${file.name}: ${file.error}`);
      continue;
    }
    files.push(
      new AttachmentBuilder(Buffer.from(file.content, 'utf8'), {
        name: file.name,
      }),
    );
  }

  const summary =
    notes.length > 0 ? notes.join('\n') : 'Runtime files attached.';
  return { summary, files };
}

export const reloadConfigCmd: CommandHandler = async (interaction) => {
  if (!(await requireAdmin(interaction))) return;

  try {
    const config = reloadConfig();
    const themes = await reloadThemes();

    if (!themes?.length) {
      console.warn('Config reloaded with no themes configured');
      await interaction.reply({
        content:
          'Warning: Config reloaded but no themes are configured. Rotations will fail.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const schedule = config.schedule ?? '0 9 * * 1';
    const timezone = config.timezone ?? 'America/New_York';

    // Import rotateTheme lazily to avoid circular dependency
    const { rotateTheme } = await import('../rotation');

    try {
      const { getConfig } = await import('../config');
      scheduleCronJob(schedule, timezone, async () => {
        const result = await rotateTheme(interaction.client, getConfig());
        if (!result.success) {
          console.error(
            `Scheduled rotation failed: ${result.error ?? 'unknown error'}`,
          );
        }
      });

      const dump = await buildRuntimeFileDump();
      await interaction.reply({
        content:
          `Config reloaded! ${themes.length} themes loaded. ` +
          `Cron rescheduled: ${schedule} (${timezone})\n${dump.summary}`,
        files: dump.files,
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({
        content: `Config reloaded with ${themes.length} themes, but cron schedule is invalid: ${schedule}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    await interaction.reply({
      content: `Failed to reload config: ${(err as Error).message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
};
