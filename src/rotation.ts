import type { Client, TextChannel } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type { Config, ThemeEntry, UpcomingTheme } from './types';
import { getState, advanceState } from './state';

let isRotating = false;

export function normalizeChannelName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Channel name must be a non-empty string');
  }

  const normalized = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 100);

  if (normalized.length < 1) {
    throw new Error(
      'Channel name must have at least 1 valid character after normalization',
    );
  }

  return normalized;
}

export function getThemeName(theme: ThemeEntry): string {
  return typeof theme === 'object' ? theme.name : theme;
}

export function getThemeMessage(theme: ThemeEntry): string | null {
  return typeof theme === 'object' ? (theme.message ?? null) : null;
}

export function getUpcomingThemes(
  config: Config,
  count = 5,
): UpcomingTheme[] {
  const { themes } = config;
  if (!themes?.length) return [];

  const state = getState();
  const upcoming: UpcomingTheme[] = [];

  for (let i = 0; i < Math.min(count, themes.length); i++) {
    const index = (state.currentIndex + i) % themes.length;
    const theme = themes[index];
    upcoming.push({
      week: i + 1,
      name: getThemeName(theme),
      message: getThemeMessage(theme),
      isCurrent: i === 0,
    });
  }

  return upcoming;
}

export function isRotationInProgress(): boolean {
  return isRotating;
}

export async function validatePermissions(
  client: Client,
  config: Config,
): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(config.channelId);
    if (!channel || !('permissionsFor' in channel)) {
      console.error(`ERROR: Channel ${config.channelId} not found`);
      return false;
    }

    const permissions = (channel as TextChannel).permissionsFor(
      client.user!,
    );
    if (!permissions) {
      console.error('ERROR: Could not resolve bot permissions');
      return false;
    }

    const missingPerms: string[] = [];
    if (!permissions.has(PermissionFlagsBits.ViewChannel)) {
      missingPerms.push('View Channel');
    }
    if (!permissions.has(PermissionFlagsBits.ManageChannels)) {
      missingPerms.push('Manage Channels');
    }

    const hasMessageThemes = config.themes.some(
      (t) => typeof t === 'object' && typeof t.message === 'string',
    );
    if (
      hasMessageThemes &&
      !permissions.has(PermissionFlagsBits.SendMessages)
    ) {
      missingPerms.push('Send Messages (needed for announcements)');
    }

    if (missingPerms.length > 0) {
      console.error(
        `WARNING: Bot lacks permissions for channel ${(channel as TextChannel).name}: ${missingPerms.join(', ')}`,
      );
      return false;
    }

    console.log(
      `Permissions validated for channel: ${(channel as TextChannel).name}`,
    );
    return true;
  } catch (err) {
    console.error(
      `ERROR validating permissions: ${(err as Error).message}`,
    );
    return false;
  }
}

export async function rotateTheme(
  client: Client,
  config: Config,
): Promise<boolean> {
  if (isRotating) {
    console.log('Rotation already in progress, skipping');
    return false;
  }

  isRotating = true;
  console.log(`[${new Date().toISOString()}] Starting rotation`);

  try {
    const { channelId, themes } = config;

    if (!themes || themes.length === 0) {
      console.error('ERROR: No themes configured');
      return false;
    }

    const channel = (await client.channels.fetch(
      channelId,
    )) as TextChannel | null;
    if (!channel) {
      console.error(`ERROR: Channel ${channelId} not found`);
      return false;
    }

    const state = getState();
    const nextIndex = state.currentIndex % themes.length;
    const theme = themes[nextIndex];
    const message = getThemeMessage(theme);

    let newName: string;
    try {
      newName = normalizeChannelName(getThemeName(theme));
    } catch (validationErr) {
      console.error(`ERROR: ${(validationErr as Error).message}`);
      return false;
    }

    if (channel.name === newName) {
      console.log(
        `Channel already named "${newName}", skipping rename`,
      );
      await advanceState(themes.length);
      return true;
    }

    await channel.setName(newName, 'Weekly theme rotation');
    console.log(`Channel renamed to: ${newName}`);

    if (message && typeof message === 'string') {
      try {
        await channel.send(message);
        console.log('Theme announcement message sent');
      } catch (msgErr) {
        console.error(
          `ERROR sending announcement: ${(msgErr as Error).message}`,
        );
      }
    }

    await advanceState(themes.length);
    console.log(`State saved. Next theme index: ${getState().currentIndex}`);

    return true;
  } catch (err) {
    console.error(`ERROR renaming channel: ${(err as Error).message}`);
    return false;
  } finally {
    isRotating = false;
    console.log(`[${new Date().toISOString()}] Rotation complete`);
  }
}
