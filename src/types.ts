import type { ChatInputCommandInteraction, Client } from 'discord.js';

export interface Theme {
  name: string;
  message?: string;
}

export type LegacyTheme = string;

export type ThemeEntry = Theme | LegacyTheme;

export class Config {
  channelId: string;
  themes: ThemeEntry[];
  schedule?: string;
  timezone?: string;
  constructor() {
    this.channelId = '';
    this.themes = [];
  }
}

export interface Themes {
  themes: ThemeEntry[]
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
