import {
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import type { CommandHandler } from '../types';
import { themes } from './themes';
import { rotateNow } from './rotate-now';
import { reloadConfigCmd } from './reload-config';
import { addThemeCmd } from './add-theme';
import { configChannel } from './config/channel';
import { configSchedule } from './config/schedule';
import { deleteThemeCmd } from './delete-theme';
import { editThemeCmd } from './edit-theme';
import { reorderThemesCmd } from './reorder-themes';

export function requireAdmin(
  interaction: ChatInputCommandInteraction,
): boolean {
  if (
    !interaction.inGuild() ||
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    interaction.reply({
      content: 'You need Administrator permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

export function resolveCommandKey(
  interaction: ChatInputCommandInteraction,
): string {
  const parts = [interaction.commandName];
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);
  if (group) parts.push(group);
  if (sub) parts.push(sub);
  return parts.join(':');
}

const commands: Record<string, CommandHandler> = {
  'theme-bot:themes': themes,
  'theme-bot:rotate-now': rotateNow,
  'theme-bot:reload-config': reloadConfigCmd,
  'theme-bot:add-theme': addThemeCmd,
  'theme-bot:config:channel': configChannel,
  'theme-bot:config:schedule': configSchedule,
  'theme-bot:delete-theme': deleteThemeCmd,
  'theme-bot:edit-theme': editThemeCmd,
  'theme-bot:reorder-themes': reorderThemesCmd,
};

export function getCommandHandler(key: string): CommandHandler | undefined {
  return commands[key];
}
