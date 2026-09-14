import type { ChatInputCommandInteraction, Client } from 'discord.js';

export interface Theme {
  name: string;
  message?: string;
}

export type LegacyTheme = string;

export type ThemeEntry = Theme | LegacyTheme;

export interface Config {
  channelId: string;
  schedule?: string;
  timezone?: string;
  /**
   * Private channel the bot posts rotation failures to. Optional on purpose:
   * the bot starts and rotates normally without it, because losing the weekly
   * rename to a misconfigured reporting channel would be worse than the silence
   * it is meant to fix.
   */
  adminChannelId?: string;
}

export interface Themes {
  themes: ThemeEntry[];
}

export interface State {
  currentIndex: number;
}

export interface UpcomingTheme {
  week: number;
  name: string;
  message: string | null;
  isCurrent: boolean;
}

export interface CommandContext {
  client: Client;
  config: Config;
}

export type CommandHandler = (
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
) => Promise<void>;
