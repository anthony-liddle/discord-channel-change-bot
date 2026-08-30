import type { CommandHandler } from '../types';
import {
  ComponentType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { requireAdmin } from './index';
import { getThemes, updateTheme } from '../themes';
import {
  buildThemeSelectRow,
  resolveThemeIndex,
  themeMessageText,
  themeNameText,
  themeOptionLabel,
} from './theme-picker';

export const editThemeCmd: CommandHandler = async (interaction) => {
  if (!(await requireAdmin(interaction))) return;

  // Acknowledge before building any component. Builder validation throws
  // synchronously, and anything thrown before the acknowledgement shows up in
  // Discord as "The application did not respond" with no way to see why.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const themes = await getThemes();
  if (themes.length === 0) {
    await interaction.editReply({ content: 'No themes to edit.' });
    return;
  }

  const selectRow = buildThemeSelectRow(
    `editThemeSelect-${interaction.user.id}`,
    'Select a theme to edit',
    themes,
  );

  const response = await interaction.editReply({
    content: 'Which theme would you like to edit?',
    components: [selectRow],
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

  // The option value is the array position, so two themes sharing a name stay
  // distinct and editing entry 7 always means entry 7.
  const index = resolveThemeIndex(selectInteraction.values[0], themes);
  if (index === -1) {
    await selectInteraction.update({
      content:
        'That theme is no longer at the position it was selected from. Run the command again.',
      components: [],
    });
    return;
  }

  const theme = themes[index];
  const currentLabel = themeOptionLabel(theme, index);
  const currentName = themeNameText(theme);
  const currentMessage = themeMessageText(theme);

  const modal = new ModalBuilder()
    .setCustomId(`editThemeModal-${interaction.user.id}`)
    .setTitle('Edit Theme');

  const nameInput = new TextInputBuilder()
    .setCustomId('themeName')
    .setStyle(TextInputStyle.Short)
    .setValue(currentName)
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
    await interaction.followUp({
      content: 'Timed out.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const newName = modalInteraction.fields.getTextInputValue('themeName');
  const newMessage =
    modalInteraction.fields.getTextInputValue('channelMessage');

  try {
    await updateTheme(index, newName, newMessage);
    await modalInteraction.reply({
      content: `Theme updated. **${currentLabel}** is now **${newName}**.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    await modalInteraction.reply({
      content: `Failed to update theme.\n> ${(err as Error).message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
};
