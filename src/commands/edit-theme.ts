import type { CommandHandler } from '../types';
import {
  ActionRowBuilder,
  ComponentType,
  LabelBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { requireAdmin } from './index';
import { getThemes, updateTheme } from '../themes';
import { getThemeName, getThemeMessage } from '../rotation';

export const editThemeCmd: CommandHandler = async (interaction) => {
  if (!requireAdmin(interaction)) return;

  const themes = await getThemes();
  if (themes.length === 0) {
    await interaction.reply({
      content: 'No themes to edit.',
      ephemeral: true,
    });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`editThemeSelect-${interaction.user.id}`)
    .setPlaceholder('Select a theme to edit')
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
    content: 'Which theme would you like to edit?',
    components: [selectRow],
    ephemeral: true,
  });

  let selectInteraction;
  try {
    selectInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) =>
        i.customId === `editThemeSelect-${interaction.user.id}` &&
        i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });
  } catch {
    await interaction.editReply({ content: 'Timed out.', components: [] });
    return;
  }

  const themeName = selectInteraction.values[0];
  const theme = themes.find((t) => getThemeName(t) === themeName);
  const currentMessage = theme ? (getThemeMessage(theme) ?? '') : '';

  const modal = new ModalBuilder()
    .setCustomId(`editThemeModal-${interaction.user.id}`)
    .setTitle('Edit Theme');

  const nameInput = new TextInputBuilder()
    .setCustomId('themeName')
    .setStyle(TextInputStyle.Short)
    .setValue(themeName)
    .setRequired(true);

  const nameLabel = new LabelBuilder()
    .setLabel('Theme Name')
    .setDescription('The channel name (e.g. "My Theme" becomes "my-theme")')
    .setTextInputComponent(nameInput);

  const messageInput = new TextInputBuilder()
    .setCustomId('channelMessage')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(currentMessage)
    .setRequired(true);

  const messageLabel = new LabelBuilder()
    .setLabel('Channel Message')
    .setDescription('Message to send when this theme is active.')
    .setTextInputComponent(messageInput);

  modal.addLabelComponents([nameLabel, messageLabel]);

  await selectInteraction.showModal(modal);

  const filter = (i: ModalSubmitInteraction) =>
    i.customId === `editThemeModal-${interaction.user.id}`;

  let modalInteraction: ModalSubmitInteraction;
  try {
    modalInteraction = await interaction.awaitModalSubmit({
      filter,
      time: 5 * 60 * 1000,
    });
  } catch {
    await interaction.followUp({ content: 'Timed out.', ephemeral: true });
    return;
  }

  const newName = modalInteraction.fields.getTextInputValue('themeName');
  const newMessage =
    modalInteraction.fields.getTextInputValue('channelMessage');

  try {
    await updateTheme(themeName, newName, newMessage);
    await modalInteraction.reply({
      content: `Theme updated! **${themeName}** is now **${newName}**.`,
      ephemeral: true,
    });
  } catch (err) {
    console.error(err);
    await modalInteraction.reply({
      content: 'Failed to update theme. Check the bot logs for details.',
      ephemeral: true,
    });
  }
};
