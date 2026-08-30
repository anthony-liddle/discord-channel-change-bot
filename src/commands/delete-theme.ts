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
import {
  buildThemeSelectRow,
  resolveThemeIndex,
  themeOptionLabel,
} from './theme-picker';

export const deleteThemeCmd: CommandHandler = async (interaction) => {
  if (!requireAdmin(interaction)) return;

  const themes = await getThemes();
  if (themes.length === 0) {
    await interaction.reply({
      content: 'No themes to delete.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const selectRow = buildThemeSelectRow(
    `deleteThemeSelect-${interaction.user.id}`,
    'Select a theme to delete',
    themes,
  );

  const response = await interaction.reply({
    content: 'Which theme would you like to delete?',
    components: [selectRow],
    flags: MessageFlags.Ephemeral,
  });

  let selectInteraction;
  try {
    selectInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) =>
        i.customId === `deleteThemeSelect-${interaction.user.id}` &&
        i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });
  } catch {
    await interaction.editReply({ content: 'Timed out.', components: [] });
    return;
  }

  // Position, not name. Deleting one of two identically named themes has to
  // remove the one that was actually picked.
  const index = resolveThemeIndex(selectInteraction.values[0], themes);
  if (index === -1) {
    await selectInteraction.update({
      content:
        'That theme is no longer at the position it was selected from. Run the command again.',
      components: [],
    });
    return;
  }

  const themeLabel = themeOptionLabel(themes[index], index);

  const confirmBtn = new ButtonBuilder()
    .setCustomId(`deleteThemeConfirm-${interaction.user.id}`)
    .setLabel('Delete')
    .setStyle(ButtonStyle.Danger);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`deleteThemeCancel-${interaction.user.id}`)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    confirmBtn,
    cancelBtn,
  );

  await selectInteraction.update({
    content: `Are you sure you want to delete **${themeLabel}**? This cannot be undone.`,
    components: [buttonRow],
  });

  let buttonInteraction;
  try {
    buttonInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) =>
        (i.customId === `deleteThemeConfirm-${interaction.user.id}` ||
          i.customId === `deleteThemeCancel-${interaction.user.id}`) &&
        i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });
  } catch {
    await interaction.editReply({ content: 'Timed out.', components: [] });
    return;
  }

  if (
    buttonInteraction.customId === `deleteThemeCancel-${interaction.user.id}`
  ) {
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
