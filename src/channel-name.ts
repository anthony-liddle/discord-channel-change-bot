/**
 * Turning a theme name into a Discord channel name.
 *
 * This lives in its own module rather than in rotation.ts because the theme
 * store has to call it to validate a write, and rotation.ts already imports the
 * theme store. Importing the other way round would close the cycle.
 */

/** Discord accepts a channel name of 1 to 100 characters. */
export const MAX_CHANNEL_NAME = 100;

/**
 * Accents are folded rather than deleted, so "Café Night" becomes "cafe-night"
 * instead of "caf-night". Discord itself accepts accented channel names, so the
 * ASCII-only restriction is this bot's own; folding keeps the admin's intent
 * legible while leaving every name that is already plain ASCII byte for byte
 * identical, which matters because a live channel is renamed from these.
 *
 * NFD splits an accented letter into its base letter plus a combining mark, so
 * stripping the combining range leaves the base letter behind. No dependency
 * needed, and it is a no-op on ASCII.
 */
export function normalizeChannelName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Channel name must be a non-empty string');
  }

  const normalized = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, MAX_CHANNEL_NAME);

  if (normalized.length < 1) {
    throw new Error(
      'Channel name must have at least 1 valid character after normalization',
    );
  }

  return normalized;
}

/**
 * Whether a name survives normalization at all. Used by the write path to
 * refuse a theme that could never rename the channel.
 */
export function canBecomeChannelName(name: string): boolean {
  try {
    normalizeChannelName(name);
    return true;
  } catch {
    return false;
  }
}
