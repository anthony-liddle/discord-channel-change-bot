import type { CommandHandler } from '../types';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { requireAdmin } from './index';
import { getThemes, deleteTheme } from '../themes';
import { themeOptionLabel } from './theme-picker';
import { THEME_OPTION, resolveThemeSelection } from './theme-autocomplete';

export const deleteThemeCmd: CommandHandler = async (interaction) => {
  if (!(await requireAdmin(interaction))) return;

  // Acknowledge before building any component. Builder validation throws
  // synchronously, and anything thrown before the acknowledgement shows up in
  // Discord as "The application did not respond" with no way to see why.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const themes = await getThemes();
  if (themes.length === 0) {
    await interaction.editReply({ content: 'No themes to delete.' });
    return;
  }

  // The theme arrives as a command option answered by autocomplete, so there is
  // no select menu and therefore no 25 option ceiling. The value carries a
  // fingerprint as well as a position, so a list that moved while the admin was
  // typing is refused rather than deleting a different theme than the one that
  // was chosen.
  const selection = resolveThemeSelection(
    interaction.options.getString(THEME_OPTION, true),
    themes,
  );
  if (!selection.ok) {
    await interaction.editReply({ content: selection.reason });
    return;
  }

  const index = selection.index;
  const themeLabel = themeOptionLabel(themes[index], index);

  const confirmId = `deleteThemeConfirm-${interaction.id}`;
  const cancelId = `deleteThemeCancel-${interaction.id}`;

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  const response = await interaction.editReply({
    content: `Are you sure you want to delete **${themeLabel}**? This cannot be undone.`,
    components: [buttonRow],
  });

  let buttonInteraction;
  try {
    buttonInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) =>
        (i.customId === confirmId || i.customId === cancelId) &&
        i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });
  } catch {
    await interaction.editReply({ content: 'Timed out.', components: [] });
    return;
  }

  if (buttonInteraction.customId === cancelId) {
    await buttonInteraction.update({ content: 'Cancelled.', components: [] });
    return;
  }

  try {
    await deleteTheme(index);
    await buttonInteraction.update({
      content: `Theme **${themeLabel}** has been deleted.`,
      components: [],
    });
  } catch (err) {
    await buttonInteraction.update({
      content: `Failed to delete theme.\n> ${(err as Error).message}`,
      components: [],
    });
  }
};
