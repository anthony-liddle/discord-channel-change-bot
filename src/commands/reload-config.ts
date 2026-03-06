import type { CommandHandler } from '../types';
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
        ephemeral: true,
      });
      return;
    }

    const schedule = config.schedule ?? '0 9 * * 1';
    const timezone = config.timezone ?? 'America/New_York';

    // Import rotateTheme lazily to avoid circular dependency
    const { rotateTheme } = await import('../rotation');

    try {
      const { getConfig } = await import('../config');
      scheduleCronJob(schedule, timezone, () => {
        rotateTheme(interaction.client, getConfig());
      });

      await interaction.reply({
        content: `Config reloaded! ${themes.length} themes loaded. Cron rescheduled: ${schedule} (${timezone})`,
        ephemeral: true,
      });
    } catch {
      await interaction.reply({
        content: `Config reloaded with ${themes.length} themes, but cron schedule is invalid: ${schedule}`,
        ephemeral: true,
      });
    }
  } catch (err) {
    await interaction.reply({
      content: `Failed to reload config: ${(err as Error).message}`,
      ephemeral: true,
    });
  }
};
