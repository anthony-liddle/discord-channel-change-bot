import type { CommandHandler } from '../../types';
import { requireAdmin } from '../index';
import { getConfig, saveConfig } from '../../config';
import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ComponentType,
} from 'discord.js';

export const configChannel: CommandHandler = async (interaction, context) => {
  if (!requireAdmin(interaction)) return;

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
    ephemeral: true,
    fetchReply: true,
  });

  try {
    const componentInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.ChannelSelect,
      filter: (i) => i.customId === `config-channel:${interaction.user.id}`,
      time: 5 * 60 * 1000,
    });

    const selectedChannelId = componentInteraction.values[0];
    const config = getConfig();
    await saveConfig({ ...config, channelId: selectedChannelId });

    await componentInteraction.update({
      content: `✅ Rotation channel updated to <#${selectedChannelId}>`,
      components: [],
    });
  } catch {
    await interaction.editReply({
      content: 'Channel selection timed out.',
      components: [],
    });
  }
};
