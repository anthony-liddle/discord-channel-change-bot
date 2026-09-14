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
import { addTheme } from '../themes';
import { formatHandlerError } from '../interaction-errors';
import {
  MAX_THEME_MESSAGE,
  MAX_THEME_NAME,
  channelNameFor,
  validateThemeName,
} from '../theme-validation';

export const addThemeCmd: CommandHandler = async (interaction) => {
  if (!(await requireAdmin(interaction))) return;
  // Scoped to this invocation, not to the user. awaitModalSubmit collects
  // client-wide filtered only by customId, so a customId shared across
  // invocations lets two live collectors both take one submit and call
  // addTheme twice, which is the most plausible origin of the duplicate entry
  // that broke edit-theme.
  const modalId = `createThemeModal-${interaction.id}`;

  const modal = new ModalBuilder().setCustomId(modalId).setTitle('New Theme');

  // Discord enforces max_length in the client, so an oversized value cannot be
  // submitted at all. That beats rejecting one after the fact, and it means
  // nobody has to know what Discord's default is when the field is omitted.
  const themeNameInput = new TextInputBuilder()
    .setCustomId('themeName')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. "Monochrome"')
    .setMaxLength(MAX_THEME_NAME)
    .setRequired(true);

  const themeNameLabel = new LabelBuilder()
    .setLabel('Theme Name')
    .setDescription(
      'This will be the channel name (e.g. "My Channel" becomes "my-channel")',
    )
    .setTextInputComponent(themeNameInput);

  const channelMessageInput = new TextInputBuilder()
    .setCustomId('channelMessage')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Post your black and white photos or whatever!')
    .setMaxLength(MAX_THEME_MESSAGE)
    .setRequired(true);

  const channelMessageLabel = new LabelBuilder()
    .setLabel('Channel Message')
    .setDescription('Message to send when channel theme is changed.')
    .setTextInputComponent(channelMessageInput);

  modal.addLabelComponents([themeNameLabel, channelMessageLabel]);

  await interaction.showModal(modal);

  const filter = (modalInteraction: ModalSubmitInteraction) =>
    modalInteraction.customId === modalId &&
    modalInteraction.user.id === interaction.user.id;

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

  const name = modalInteraction.fields.getTextInputValue('themeName');
  const message = modalInteraction.fields.getTextInputValue('channelMessage');

  try {
    // Validated here as well as in the store so the echo below shows exactly
    // the name that was stored, and so both paths fail with the same wording.
    const storedName = validateThemeName(name);
    await addTheme(storedName, message);
    await modalInteraction.reply({
      content:
        `Theme added: **${storedName}**\n` +
        `When it comes up, the channel will be renamed to \`#${channelNameFor(storedName)}\`.`,
    });
  } catch (err) {
    // Pointing at the logs is useless when nobody on the admin team can read
    // them. Say what actually failed.
    await modalInteraction.reply({
      content: `Failed to save theme.\n> ${formatHandlerError(err)}`,
      flags: MessageFlags.Ephemeral,
    });
  }
};
