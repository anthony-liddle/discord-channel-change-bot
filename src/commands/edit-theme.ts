import type { CommandHandler } from '../types';
import {
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
  themeMessageText,
  themeNameText,
  themeOptionLabel,
} from './theme-picker';
import { THEME_OPTION, resolveThemeSelection } from './theme-autocomplete';
import {
  MAX_THEME_MESSAGE,
  MAX_THEME_NAME,
  channelNameFor,
  validateThemeName,
} from '../theme-validation';

export const editThemeCmd: CommandHandler = async (interaction) => {
  if (!(await requireAdmin(interaction))) return;

  const themes = await getThemes();
  if (themes.length === 0) {
    await interaction.reply({
      content: 'No themes to edit.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // The theme arrives as a command option answered by autocomplete, so there is
  // no select menu and therefore no 25 option ceiling. The value carries a
  // fingerprint as well as a position, so a list that moved while the admin was
  // typing is refused rather than silently resolving to a different theme.
  const selection = resolveThemeSelection(
    interaction.options.getString(THEME_OPTION, true),
    themes,
  );
  if (!selection.ok) {
    await interaction.reply({
      content: selection.reason,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const index = selection.index;
  const theme = themes[index];
  const currentLabel = themeOptionLabel(theme, index);
  const currentName = themeNameText(theme);
  const currentMessage = themeMessageText(theme);

  // Scoped to this invocation, not to the user. awaitModalSubmit builds a
  // client-wide collector filtered only by customId, so a customId shared
  // across invocations lets an abandoned run capture a later run's submit and
  // write to the index IT resolved. interaction.id is unique per invocation.
  const modalId = `editThemeModal-${interaction.id}`;

  const modal = new ModalBuilder().setCustomId(modalId).setTitle('Edit Theme');

  // Discord enforces max_length in the client, so an oversized value cannot be
  // submitted at all. The prefill is sliced to the same cap because a value
  // longer than max_length is rejected outright.
  const nameInput = new TextInputBuilder()
    .setCustomId('themeName')
    .setStyle(TextInputStyle.Short)
    .setValue(currentName.slice(0, MAX_THEME_NAME))
    .setMaxLength(MAX_THEME_NAME)
    .setRequired(true);

  const nameLabel = new LabelBuilder()
    .setLabel('Theme Name')
    .setDescription('The channel name (e.g. "My Theme" becomes "my-theme")')
    .setTextInputComponent(nameInput);

  const messageInput = new TextInputBuilder()
    .setCustomId('channelMessage')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(currentMessage.slice(0, MAX_THEME_MESSAGE))
    .setMaxLength(MAX_THEME_MESSAGE)
    .setRequired(true);

  const messageLabel = new LabelBuilder()
    .setLabel('Channel Message')
    .setDescription('Message to send when this theme is active.')
    .setTextInputComponent(messageInput);

  modal.addLabelComponents([nameLabel, messageLabel]);

  await interaction.showModal(modal);

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
    // Validated here as well as in the store so the echo below shows exactly
    // the name that was stored, and so both paths fail with the same wording.
    const storedName = validateThemeName(newName);
    await updateTheme(index, storedName, newMessage);
    await modalInteraction.reply({
      content:
        `Theme updated. **${currentLabel}** is now **${storedName}**.\n` +
        `When it comes up, the channel will be renamed to \`#${channelNameFor(storedName)}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    await modalInteraction.reply({
      content: `Failed to update theme.\n> ${(err as Error).message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
};
