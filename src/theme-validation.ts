import { canBecomeChannelName, normalizeChannelName } from './channel-name';

/**
 * Validation for everything that can be written into themes.json.
 *
 * Before this existed the write path checked for duplicate names and nothing
 * else, which is the root cause of most of what the 2026-09-14 ceiling report
 * found. The modals are deliberately not the only place these run: themes.json
 * gets hand edited on the Fly volume, and that bypasses every modal.
 */

/**
 * A theme name is at most as long as the channel name it becomes. Normalization
 * never lengthens a string, so a name within this cap always produces a channel
 * name within Discord's own 1 to 100 limit, and it also keeps every picker
 * label inside the 100 character cap that breaks reorder-themes today.
 */
export const MAX_THEME_NAME = 100;

/**
 * Discord rejects message content over 2000 characters. rotateTheme catches and
 * logs a failed announcement and carries on, so an oversized message renames
 * the channel and then silently posts nothing.
 */
export const MAX_THEME_MESSAGE = 2000;

export function validateThemeName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new Error(
      `Theme name must be text, but it is ${describeType(name)}.`,
    );
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new Error('Theme name cannot be empty.');
  }

  if (trimmed.length > MAX_THEME_NAME) {
    throw new Error(
      `Theme name is ${trimmed.length} characters. It can be at most ` +
        `${MAX_THEME_NAME} characters, because that is the longest a Discord ` +
        'channel name can be.',
    );
  }

  // The rotation wedge, stopped at the write. A name that cannot normalize
  // throws every time rotateTheme reaches it, and because the index only
  // advances after a successful rename, it would retry the same entry every
  // week forever.
  if (!canBecomeChannelName(trimmed)) {
    throw new Error(
      `"${trimmed}" cannot become a channel name. Channel names use only ` +
        'letters, numbers, hyphens and underscores, and this name has none of ' +
        'those left once the rest is removed. Add at least one letter or number.',
    );
  }

  return trimmed;
}

export function validateThemeMessage(message: unknown): string {
  if (typeof message !== 'string') {
    throw new Error(
      `Theme message must be text, but it is ${describeType(message)}.`,
    );
  }

  if (message.length > MAX_THEME_MESSAGE) {
    throw new Error(
      `Theme message is ${message.length} characters. Discord will not post ` +
        `more than ${MAX_THEME_MESSAGE} characters, so the announcement would ` +
        'silently never appear.',
    );
  }

  return message;
}

/**
 * What the channel will actually be called. Safe to call on a name that has
 * already been through validateThemeName, which guarantees it normalizes.
 */
export function channelNameFor(name: string): string {
  return normalizeChannelName(name);
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  return `a ${typeof value}`;
}
