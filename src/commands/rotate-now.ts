import type { CommandHandler } from '../types';
import { getState } from '../state';
import {
  rotateTheme,
  getThemeName,
  isRotationInProgress,
} from '../rotation';
import { requireAdmin } from './index';

export const rotateNow: CommandHandler = async (interaction, context) => {
  if (!requireAdmin(interaction)) return;

  if (isRotationInProgress()) {
    await interaction.reply({
      content: 'A rotation is already in progress. Please wait.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const success = await rotateTheme(context.client, context.config);

  if (success) {
    const { themes } = context.config;
    const state = getState();
    const prevIndex =
      (state.currentIndex - 1 + themes.length) % themes.length;
    const currentTheme = themes[prevIndex];
    await interaction.editReply({
      content: `Theme rotated! New theme: \`${getThemeName(currentTheme)}\``,
    });
  } else {
    await interaction.editReply({
      content: 'Rotation failed. Check the bot logs for details.',
    });
  }
};
