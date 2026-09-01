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
  OVER_LIMIT_MESSAGE,
  buildThemeSelectRow,
  isOverSelectLimit,
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

  if (isOverSelectLimit(themes)) {
    await interaction.editReply({ content: OVER_LIMIT_MESSAGE });
    return;
  }

  // Scoped to this invocation, not to the user. awaitModalSubmit builds a
  // client-wide collector filtered only by customId, so a customId shared
  // across invocations lets an abandoned run capture a later run's submit and
  // write to the index IT resolved. interaction.id is unique per invocation.
  const selectId = `editThemeSelect-${interaction.id}`;
  const modalId = `editThemeModal-${interaction.id}`;

  const selectRow = buildThemeSelectRow(
    selectId,
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
        i.customId === selectId && i.user.id === interaction.user.id,
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

  const modal = new ModalBuilder().setCustomId(modalId).setTitle('Edit Theme');

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

  // The select is still on screen and still clickable, but its collector is
  // spent. Clear it, or a second click returns Discord's bare "didn't respond
  // in time" with no explanation.
  await interaction.editReply({
    content:
      `Editing **${currentLabel}**. Submit the form to save your changes.\n` +
      'To edit a different theme, run `/theme-bot edit-theme` again.',
    components: [],
  });

  const filter = (i: ModalSubmitInteraction) =>
    i.customId === modalId && i.user.id === interaction.user.id;

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
