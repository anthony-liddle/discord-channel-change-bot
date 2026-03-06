import type { CommandHandler } from '../types';
import {
  LabelBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getThemeName } from '../rotation';
import { requireAdmin } from './index';
import { addTheme } from '../themes';

export const addThemeCmd: CommandHandler = async (interaction) => {
  if (!requireAdmin(interaction)) return;
  const modal = new ModalBuilder()
    .setCustomId(`createThemeModal-${interaction.user.id}`)
    .setTitle('New Theme');

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
    modalInteraction.customId === `createThemeModal-${interaction.user.id}`;

  let modalInteraction: ModalSubmitInteraction | undefined;
  try {
    modalInteraction = await interaction.awaitModalSubmit({
      filter,
      time: 5 * 60 * 1000,
    });
    const name = modalInteraction.fields.getTextInputValue('themeName');
    const message = modalInteraction.fields.getTextInputValue('channelMessage');
    await addTheme(name, message);
    await modalInteraction.reply({
      content: `Theme Added! New theme: \`${getThemeName(name)}\``,
    });
  } catch (err) {
    console.error(err);
    if (modalInteraction) {
      await modalInteraction.reply({
        content: 'Failed to save theme. Check the bot logs for details.',
        ephemeral: true,
      });
    }
  }
};
