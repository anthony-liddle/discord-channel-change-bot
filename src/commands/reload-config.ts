import type { CommandHandler } from '../types';
import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { reloadConfig } from '../config';
import { scheduleCronJob } from '../scheduler';
import { requireAdmin } from './index';
import { reloadThemes } from '../themes';
import { readRuntimeFiles } from '../runtime-files';
import { auditThemes, formatThemeProblems } from '../theme-validation';
import type { ThemeEntry } from '../types';

/**
 * themes.json is hand edited on the volume, and that path calls neither
 * addTheme nor updateTheme, so nothing has validated it. reload-config is the
 * moment the bot first reads that edit, which makes it the last chance to catch
 * a bad entry before the rotation reaches it on a Monday morning.
 *
 * It reports rather than refuses. A list with problems is still the list that
 * is now loaded, and refusing would leave the bot running the previous one with
 * no way to see the new file.
 */
function describeThemeProblems(themes: ThemeEntry[]): string {
  const report = formatThemeProblems(auditThemes(themes));
  return report ? `\n\n${report}` : '';
}

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

  // Read the files before anything that can fail, and attach them to every
  // reply path. A themes.json that will not parse is swallowed by loadThemes
  // and routes to the "no themes configured" branch below, which is exactly the
  // state where seeing the raw bytes matters most.
  const dump = await buildRuntimeFileDump();

  try {
    const config = reloadConfig();
    const themes = await reloadThemes();

    if (!themes?.length) {
      console.warn('Config reloaded with no themes configured');
      await interaction.reply({
        content:
          'Warning: Config reloaded but no themes are configured. Rotations will fail.\n' +
          dump.summary,
        files: dump.files,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const schedule = config.schedule ?? '0 9 * * 1';
    const timezone = config.timezone ?? 'America/New_York';

    // Imported lazily to avoid a circular dependency through rotation.
    const { makeScheduledRotation } = await import('../scheduled-rotation');

    try {
      const { getConfig } = await import('../config');
      scheduleCronJob(
        schedule,
        timezone,
        makeScheduledRotation(interaction.client, getConfig),
      );

      await interaction.reply({
        content:
          `Config reloaded! ${themes.length} themes loaded. ` +
          `Cron rescheduled: ${schedule} (${timezone})\n${dump.summary}` +
          describeThemeProblems(themes),
        files: dump.files,
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({
        content:
          `Config reloaded with ${themes.length} themes, but cron schedule is invalid: ${schedule}\n` +
          dump.summary +
          describeThemeProblems(themes),
        files: dump.files,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    await interaction.reply({
      content:
        `Failed to reload config: ${(err as Error).message}\n` + dump.summary,
      files: dump.files,
      flags: MessageFlags.Ephemeral,
    });
  }
};
