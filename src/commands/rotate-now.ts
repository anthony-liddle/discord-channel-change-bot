import type { CommandHandler } from '../types';
import { MessageFlags } from 'discord.js';
import { rotateTheme, isRotationInProgress } from '../rotation';
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
  const result = await rotateTheme(context.client, context.config);

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
