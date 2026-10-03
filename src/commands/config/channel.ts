import type { CommandHandler } from '../../types';
import { requireAdmin } from '../index';
import { getConfig, saveConfig } from '../../config';
import { formatHandlerError } from '../../interaction-errors';
import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ComponentType,
  MessageFlags,
} from 'discord.js';

export const configChannel: CommandHandler = async (interaction, context) => {
  if (!(await requireAdmin(interaction))) return;

  const currentChannelId = context.config.channelId;

  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(`config-channel:${interaction.user.id}`)
    .setPlaceholder('Select a channel')
    .addChannelTypes(ChannelType.GuildText)
    .setDefaultChannels([currentChannelId]);

  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    menu,
  );

  const response = await interaction.reply({
    content: `**Configure Rotation Channel**\nCurrently tracking: <#${currentChannelId}>\nSelect a new channel below:`,
    components: [row],
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  });

  // Only the wait for a pick can time out. A save that failed used to be
  // reported as a timeout too, while the rotation channel stayed unchanged.
  let componentInteraction;
  try {
    componentInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.ChannelSelect,
      filter: (i) => i.customId === `config-channel:${interaction.user.id}`,
      time: 5 * 60 * 1000,
    });
  } catch {
    await interaction.editReply({
      content: 'Channel selection timed out.',
      components: [],
    });
    return;
  }

  const selectedChannelId = componentInteraction.values[0];
  try {
    await saveConfig({ ...getConfig(), channelId: selectedChannelId });
  } catch (err) {
    await componentInteraction.update({
      content: `Failed to update the rotation channel.\n> ${formatHandlerError(err)}`,
      components: [],
    });
    return;
  }

  await componentInteraction.update({
    content: `✅ Rotation channel updated to <#${selectedChannelId}>`,
    components: [],
  });
};
