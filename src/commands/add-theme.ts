import type { CommandHandler } from '../types';
import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getThemeName } from '../rotation';
import { requireAdmin } from './index';
import { addTheme } from '../themes';
import { formatHandlerError } from '../interaction-errors';

export const addThemeCmd: CommandHandler = async (interaction) => {
  if (!(await requireAdmin(interaction))) return;
  // Scoped to this invocation, not to the user. awaitModalSubmit collects
  // client-wide filtered only by customId, so a customId shared across
  // invocations lets two live collectors both take one submit and call
  // addTheme twice, which is the most plausible origin of the duplicate entry
  // that broke edit-theme.
  const modalId = `createThemeModal-${interaction.id}`;

  const modal = new ModalBuilder().setCustomId(modalId).setTitle('New Theme');

  const themeNameInput = new TextInputBuilder()
    .setCustomId('themeName')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. "Monochrome"')
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
    await addTheme(name, message);
    await modalInteraction.reply({
      content: `Theme Added! New theme: \`${getThemeName(name)}\``,
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
