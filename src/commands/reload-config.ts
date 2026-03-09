import type { CommandHandler } from '../types';
import { MessageFlags } from 'discord.js';
import { reloadConfig } from '../config';
import { scheduleCronJob } from '../scheduler';
import { requireAdmin } from './index';
import { reloadThemes } from '../themes';

export const reloadConfigCmd: CommandHandler = async (interaction) => {
  if (!requireAdmin(interaction)) return;

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

      await interaction.reply({
        content: `Config reloaded! ${themes.length} themes loaded. Cron rescheduled: ${schedule} (${timezone})`,
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
