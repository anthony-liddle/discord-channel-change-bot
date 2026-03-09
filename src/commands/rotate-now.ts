import type { CommandHandler } from '../types';
import { MessageFlags } from 'discord.js';
import { getState } from '../state';
import { rotateTheme, getThemeName, isRotationInProgress } from '../rotation';
import { requireAdmin } from './index';
import { getThemes } from '../themes';

export const rotateNow: CommandHandler = async (interaction, context) => {
  if (!requireAdmin(interaction)) return;

  if (isRotationInProgress()) {
    await interaction.reply({
      content: 'A rotation is already in progress. Please wait.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await rotateTheme(context.client, context.config);

  if (result.success) {
    const themes = await getThemes();
    const state = getState();
    const prevIndex = (state.currentIndex - 1 + themes.length) % themes.length;
    const currentTheme = themes[prevIndex];
    await interaction.editReply({
      content: `Theme rotated! New theme: \`${getThemeName(currentTheme)}\``,
    });
  } else {
    const reason = result.error ? `\n> ${result.error}` : '';
    await interaction.editReply({
      content: `Rotation failed.${reason}\n\nCheck the bot logs for full details.`,
    });
  }
};
