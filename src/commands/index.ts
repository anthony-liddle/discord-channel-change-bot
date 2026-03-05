import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import type { CommandHandler } from '../types';
import { themes } from './themes';
import { rotateNow } from './rotate-now';
import { reloadConfigCmd } from './reload-config';

export function requireAdmin(
  interaction: ChatInputCommandInteraction,
): boolean {
  if (
    !interaction.inGuild() ||
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    interaction.reply({
      content: 'You need Administrator permission to use this command.',
      ephemeral: true,
    });
    return false;
  }
  return true;
}

const commands: Record<string, CommandHandler> = {
  themes,
  'rotate-now': rotateNow,
  'reload-config': reloadConfigCmd,
};

export function getCommandHandler(name: string): CommandHandler | undefined {
  return commands[name];
}
