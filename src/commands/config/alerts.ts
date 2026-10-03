import type { CommandHandler, Config } from '../../types';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ChannelSelectMenuInteraction,
  type Client,
  type GuildChannel,
  type MessageComponentInteraction,
} from 'discord.js';
import { requireAdmin } from '../index';
import { getConfig, saveConfig } from '../../config';
import {
  adminChannelClashesWithRotation,
  probeAlertChannel,
  readChannelId,
  successNoticesEnabled,
} from '../../admin-alerts';
import { formatHandlerError } from '../../interaction-errors';

const TIMEOUT = 5 * 60 * 1000;

/**
 * /theme-bot config alerts: where rotation alerts go, and whether a line is
 * posted on every successful rotation too.
 *
 * These used to be set only by editing config.json on the volume, which only
 * the bot owner can reach. One action per run: pick a channel, toggle the
 * weekly notice, or turn alerts off.
 */
export const configAlerts: CommandHandler = async (interaction, context) => {
  if (!(await requireAdmin(interaction))) return;

  // Keyed on the invocation, not the user, so an abandoned run cannot take a
  // later run's click.
  const ids = {
    channel: `config-alerts-channel:${interaction.id}`,
    notices: `config-alerts-notices:${interaction.id}`,
    off: `config-alerts-off:${interaction.id}`,
  };
  const alertChannel = readChannelId(context.config);
  const noticesOn = successNoticesEnabled(context.config);

  // Nothing preselected: Discord sends nothing when the option picked is
  // already the selected one, which is how the schedule picker could not keep
  // its current day.
  const picker = new ChannelSelectMenuBuilder()
    .setCustomId(ids.channel)
    .setPlaceholder('Pick a private channel for alerts')
    .addChannelTypes(ChannelType.GuildText);

  // Neither button means anything until there is a channel to post to.
  const buttons = [
    new ButtonBuilder()
      .setCustomId(ids.notices)
      .setLabel(
        noticesOn ? 'Turn weekly notices off' : 'Turn weekly notices on',
      )
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!alertChannel),
    new ButtonBuilder()
      .setCustomId(ids.off)
      .setLabel('Turn alerts off')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!alertChannel),
  ];

  const reply = await interaction.reply({
    content: describeCurrent(alertChannel, noticesOn),
    components: [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(picker),
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
    ],
    flags: MessageFlags.Ephemeral,
    withResponse: true,
  });

  // Only the wait for a choice can time out. Anything that fails after one
  // arrives says what failed.
  let action: MessageComponentInteraction;
  try {
    action = await reply.resource!.message!.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        Object.values(ids).includes(i.customId),
      time: TIMEOUT,
    });
  } catch {
    await interaction.editReply({
      content: 'Alert settings timed out.',
      components: [],
    });
    return;
  }

  let content: string;
  try {
    if (action.customId === ids.channel) {
      const picked = (action as ChannelSelectMenuInteraction).values[0];
      content = await useChannel(context.client, picked);
    } else if (action.customId === ids.notices) {
      content = await toggleNotices();
    } else {
      content = await turnOff();
    }
  } catch (err) {
    content = `Failed to update the alert settings.\n> ${formatHandlerError(err)}`;
  }

  await action.update({ content, components: [] });
};

function describeCurrent(channel: string | null, noticesOn: boolean): string {
  if (!channel) {
    return (
      '**Rotation alerts**\n' +
      'Alerts are off, so a failed rotation shows only in the host logs. ' +
      'Pick a private channel below to receive them.'
    );
  }
  return (
    '**Rotation alerts**\n' +
    `Alerts go to <#${channel}>. Weekly success notices are ` +
    `${noticesOn ? 'on' : 'off'}.\n` +
    'Pick a different channel, or use the buttons below.'
  );
}

/**
 * Checked in the order that keeps a mistake from posting anywhere: the theme
 * channel and public channels are refused before the test line is sent, and
 * the test line has to arrive before anything is saved. An alert channel the
 * bot cannot post in is worse than none, because it gets relied on.
 */
async function useChannel(client: Client, channelId: string): Promise<string> {
  // Read after the pick, not when the command opened, so a change another
  // command made while this reply was open is kept rather than overwritten.
  const candidate: Config = { ...getConfig(), adminChannelId: channelId };

  if (adminChannelClashesWithRotation(candidate)) {
    return (
      `Not changed. <#${channelId}> is the channel the bot renames, so every ` +
      'alert and weekly notice would go to everyone who reads the theme ' +
      'channel. Pick a private channel.'
    );
  }

  if (await visibleToEveryone(client, channelId)) {
    return (
      `Not changed. Everyone in the server can read <#${channelId}>, so every ` +
      'alert and weekly notice would be posted for all of them. Pick a ' +
      'channel only admins can see, or change its permissions and pick it ' +
      'again.'
    );
  }

  const probe = await probeAlertChannel(
    client,
    candidate,
    '/theme-bot config alerts',
  );
  if (probe.status !== 'posted') {
    const reason =
      probe.status === 'not-configured' ? 'no channel given' : probe.detail;
    return (
      `Not changed. The bot could not post a test line in <#${channelId}> ` +
      `(${reason}), so it could not post alerts there either. Give it View ` +
      'Channel and Send Messages there and pick it again.'
    );
  }

  await saveConfig(candidate);
  return (
    `Alerts now go to <#${channelId}>. A test line was just posted there.\n` +
    (successNoticesEnabled(candidate)
      ? 'Weekly success notices are on, so silence there means something is wrong.'
      : 'Weekly success notices are off, so only failures will appear.')
  );
}

async function toggleNotices(): Promise<string> {
  const current = getConfig();
  const on = !successNoticesEnabled(current);
  await saveConfig({ ...current, adminSuccessNotices: on });

  const where = `<#${readChannelId(current)}>`;
  return on
    ? `Weekly success notices are now on in ${where}, so silence there means something is wrong.`
    : `Weekly success notices are now off. Failures are still reported in ${where}.`;
}

/**
 * Removes the key rather than blanking it, so nothing reading config.json has
 * an empty id to interpret.
 */
async function turnOff(): Promise<string> {
  const next: Config = { ...getConfig() };
  delete next.adminChannelId;
  await saveConfig(next);
  return (
    'Alerts are now off, so a failed rotation shows only in the host logs. ' +
    'Pick a channel with `/theme-bot config alerts` to turn them back on.'
  );
}

/**
 * Whether @everyone can see the channel. Never throws and never blocks a save
 * on its own: a channel it cannot inspect is left to the test line, which
 * reports whatever is actually wrong.
 */
async function visibleToEveryone(
  client: Client,
  channelId: string,
): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !('guild' in channel) || !('permissionsFor' in channel)) {
      return false;
    }
    const guildChannel = channel as GuildChannel;
    const everyone = guildChannel.guild.roles.everyone;
    return (
      guildChannel
        .permissionsFor(everyone)
        ?.has(PermissionFlagsBits.ViewChannel) ?? false
    );
  } catch {
    return false;
  }
}
