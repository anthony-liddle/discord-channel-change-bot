import type { CommandHandler } from '../types';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { requireAdmin } from './index';
import { getThemes, deleteTheme } from '../themes';
import { getThemeName } from '../rotation';

export const deleteThemeCmd: CommandHandler = async (interaction) => {
  if (!requireAdmin(interaction)) return;

  const themes = await getThemes();
  if (themes.length === 0) {
    await interaction.reply({
      content: 'No themes to delete.',
      ephemeral: true,
    });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`deleteThemeSelect-${interaction.user.id}`)
    .setPlaceholder('Select a theme to delete')
    .addOptions(
      themes.map((t) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(getThemeName(t))
          .setValue(getThemeName(t)),
      ),
    );

  const selectRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const response = await interaction.reply({
    content: 'Which theme would you like to delete?',
    components: [selectRow],
    ephemeral: true,
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

  const themeName = selectInteraction.values[0];

  const confirmBtn = new ButtonBuilder()
    .setCustomId(`deleteThemeConfirm-${interaction.user.id}`)
    .setLabel(`Delete "${themeName}"`)
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
    content: `Are you sure you want to delete **${themeName}**? This cannot be undone.`,
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
    await deleteTheme(themeName);
    await buttonInteraction.update({
      content: `Theme **${themeName}** has been deleted.`,
      components: [],
    });
  } catch (err) {
    console.error(err);
    await buttonInteraction.update({
      content: 'Failed to delete theme. Check the bot logs for details.',
      components: [],
    });
  }
};
